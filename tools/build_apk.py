#!/usr/bin/env python3
"""Sovereign Portal C-137 - Android APK assembler (no Gradle required).

Assembles a real, installable, debug-signed APK for the sovereign portal shell
using only the Android SDK build-tools plus a JDK:

    aapt2 compile  ->  aapt2 link  ->  javac  ->  d8  ->  zipalign  ->  apksigner

Why not Gradle?
    The canonical Android project in ``apps/native-android`` is a normal Gradle
    project (Kotlin + AndroidX) and is the correct way to build the app on a
    developer machine or in CI. This script exists so the APK can also be
    produced on a machine that has nothing but a JDK and the SDK build-tools -
    no Gradle distribution, no Android Gradle Plugin, and no network access to
    resolve the AndroidX dependency graph.

    It therefore compiles the framework-only shell in
    ``apps/native-android/apk-fallback/java`` (which implements the same
    ``SovereignBridge`` contract as the Kotlin shell) and swaps the AppCompat
    theme parent for the framework Material theme, which is the only AndroidX
    dependency in the resource graph.

Output
    dist/android/SovereignPortalC137.apk
    dist/android/SovereignPortalC137.apk.SHA256.txt
    dist/android/apk-build.log

Usage
    python tools/build_apk.py
    python tools/build_apk.py --website dist/website --verbose
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Iterable, List, Optional

ROOT = Path(__file__).resolve().parent.parent
ANDROID_PROJ = ROOT / "apps" / "native-android"
FALLBACK_JAVA = ANDROID_PROJ / "apk-fallback" / "java"
DIST_ANDROID = ROOT / "dist" / "android"

APP_ID = "com.rickc137.portal"
VERSION_CODE = "1"
VERSION_NAME = "1.0.0"
MIN_SDK = "24"
TARGET_SDK = "34"

BUILD_TOOLS_VERSION = "34.0.0"
PLATFORM = "android-34"

_LOG_LINES: List[str] = []


# --------------------------------------------------------------------------- #
# logging / process helpers
# --------------------------------------------------------------------------- #
def log(message: str) -> None:
    line = f"[apk] {message}"
    print(line, flush=True)
    _LOG_LINES.append(line)


def fail(message: str) -> "NoReturn":  # type: ignore[valid-type]
    log(f"FAILED: {message}")
    _flush_log()
    sys.exit(1)


def _flush_log() -> None:
    try:
        DIST_ANDROID.mkdir(parents=True, exist_ok=True)
        (DIST_ANDROID / "apk-build.log").write_text("\n".join(_LOG_LINES) + "\n", encoding="utf-8")
    except OSError:
        pass


def run(cmd: List[str], *, env: Optional[dict] = None, verbose: bool = False) -> str:
    """Run a command, returning combined output. Raises on failure."""
    cmd = [str(c) for c in cmd]

    # CreateProcess cannot launch a .bat/.cmd directly; route it through cmd.exe.
    if os.name == "nt" and cmd[0].lower().endswith((".bat", ".cmd")):
        cmd = ["cmd.exe", "/c", subprocess.list2cmdline(cmd)]

    printable = " ".join(cmd)
    if verbose:
        log(f"$ {printable}")
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        text=True,
        errors="replace",
    )
    output = result.stdout or ""
    if result.returncode != 0:
        log(f"command failed ({result.returncode}): {printable}")
        for line in output.splitlines()[-40:]:
            log(f"  | {line}")
        raise RuntimeError(f"command failed: {printable}")
    if verbose and output.strip():
        for line in output.splitlines()[-15:]:
            log(f"  | {line}")
    return output


def bat(cmd: List[str]) -> List[str]:
    """Wrap a Windows .bat/.cmd so subprocess can execute it."""
    return cmd


# --------------------------------------------------------------------------- #
# toolchain discovery
# --------------------------------------------------------------------------- #
class Toolchain:
    def __init__(self, jdk_home: Path, sdk_root: Path) -> None:
        self.jdk_home = jdk_home
        self.sdk_root = sdk_root
        self.build_tools = sdk_root / "build-tools" / BUILD_TOOLS_VERSION
        self.android_jar = sdk_root / "platforms" / PLATFORM / "android.jar"

        exe = ".exe" if os.name == "nt" else ""
        self.javac = jdk_home / "bin" / f"javac{exe}"
        self.java = jdk_home / "bin" / f"java{exe}"
        self.keytool = jdk_home / "bin" / f"keytool{exe}"
        self.aapt2 = self.build_tools / f"aapt2{exe}"
        self.zipalign = self.build_tools / f"zipalign{exe}"
        self.d8_jar = self.build_tools / "lib" / "d8.jar"

        apksigner = self.build_tools / f"apksigner{'.bat' if os.name == 'nt' else ''}"
        self.apksigner = apksigner

    def env(self) -> dict:
        env = os.environ.copy()
        env["JAVA_HOME"] = str(self.jdk_home)
        env["ANDROID_HOME"] = str(self.sdk_root)
        env["ANDROID_SDK_ROOT"] = str(self.sdk_root)
        env["PATH"] = f"{self.jdk_home / 'bin'}{os.pathsep}{self.build_tools}{os.pathsep}{env.get('PATH', '')}"
        return env

    def missing(self) -> List[str]:
        required = {
            "javac": self.javac,
            "java": self.java,
            "keytool": self.keytool,
            "aapt2": self.aapt2,
            "zipalign": self.zipalign,
            "d8.jar": self.d8_jar,
            "apksigner": self.apksigner,
            "android.jar": self.android_jar,
        }
        return [f"{name} ({path})" for name, path in required.items() if not path.exists()]


def discover_toolchain() -> Toolchain:
    candidates_jdk: List[Path] = []
    candidates_sdk: List[Path] = []

    # 1. Explicit environment variables.
    for var in ("JAVA_HOME", "JDK_HOME"):
        value = os.environ.get(var)
        if value:
            candidates_jdk.append(Path(value))
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        value = os.environ.get(var)
        if value:
            candidates_sdk.append(Path(value))

    # 2. The repo-local toolchain produced by the setup scripts.
    local = ROOT.parent / "_toolchain"
    candidates_jdk.append(local / "jdk")
    candidates_sdk.append(local / "android-sdk")

    # 3. Managed runtime locations.
    candidates_jdk.extend(
        [
            Path.home() / ".accio" / "toolchains" / "jdk",
            Path("C:/Program Files/Eclipse Adoptium"),
        ]
    )
    candidates_sdk.extend(
        [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk",
            Path.home() / "AppData" / "Local" / "Android" / "Sdk",
        ]
    )

    jdk_home = first_matching(candidates_jdk, lambda p: (p / "bin" / (("javac.exe") if os.name == "nt" else "javac")).exists())
    sdk_root = first_matching(candidates_sdk, lambda p: (p / "platforms").exists() or (p / "cmdline-tools").exists())

    if jdk_home is None:
        fail(
            "No JDK found. Set JAVA_HOME or install one under "
            f"{ROOT.parent / '_toolchain' / 'jdk'}."
        )
    if sdk_root is None:
        fail(
            "No Android SDK found. Set ANDROID_HOME/ANDROID_SDK_ROOT or install one under "
            f"{ROOT.parent / '_toolchain' / 'android-sdk'}."
        )

    return Toolchain(jdk_home, sdk_root)


def first_matching(candidates: Iterable[Path], predicate) -> Optional[Path]:
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        try:
            resolved = Path(candidate)
        except TypeError:
            continue
        key = str(resolved).lower()
        if key in seen:
            continue
        seen.add(key)
        try:
            if predicate(resolved):
                return resolved
            # Not a match itself: expand one level, which is how a bare
            # "Eclipse Adoptium" install root resolves to its newest JDK.
            children = sorted([c for c in resolved.iterdir() if c.is_dir()], reverse=True)
            for child in children:
                try:
                    if predicate(child):
                        return child
                except OSError:
                    continue
        except (OSError, PermissionError):
            continue
    return None


# --------------------------------------------------------------------------- #
# staging
# --------------------------------------------------------------------------- #
APPCOMPAT_PARENT = "Theme.AppCompat.NoActionBar"
FRAMEWORK_PARENT = "android:Theme.Material.NoActionBar"


def stage_project(work: Path, website: Path, toolchain: Toolchain) -> dict:
    """Materialise a Gradle-free build tree in ``work``."""
    manifest_src = ANDROID_PROJ / "app" / "src" / "main" / "AndroidManifest.xml"
    res_src = ANDROID_PROJ / "app" / "src" / "main" / "res"

    if not manifest_src.exists():
        fail(f"AndroidManifest.xml not found at {manifest_src}")
    if not res_src.exists():
        fail(f"Android resources not found at {res_src}")
    if not FALLBACK_JAVA.exists():
        fail(f"Fallback Java sources not found at {FALLBACK_JAVA}")
    if not website.exists():
        fail(f"Website bundle not found at {website}. Run `node tools/build-portal.mjs` first.")

    manifest_dst = work / "AndroidManifest.xml"
    res_dst = work / "res"
    java_dst = work / "java"
    assets_dst = work / "assets"
    gen_dst = work / "gen"
    classes_dst = work / "classes"
    dex_dst = work / "dex"

    # The Gradle project declares its identifier via `namespace` in
    # app/build.gradle.kts, so the manifest itself has no `package` attribute.
    # aapt2 requires one, so inject it here.
    manifest_text = manifest_src.read_text(encoding="utf-8")
    head = manifest_text.split("<application", 1)[0]
    if "package=" not in head:
        manifest_text = manifest_text.replace(
            "<manifest ", f'<manifest package="{APP_ID}" ', 1
        )
        log(f"injected manifest package attribute: {APP_ID}")
    manifest_dst.write_text(manifest_text, encoding="utf-8")

    shutil.copytree(res_src, res_dst)
    shutil.copytree(FALLBACK_JAVA, java_dst)
    shutil.copytree(website, assets_dst)
    for d in (gen_dst, classes_dst, dex_dst):
        d.mkdir(parents=True, exist_ok=True)

    # Drop build-only artefacts the portal does not need on-device.
    for junk in ("Dockerfile", "nginx.conf", "vercel.json", "netlify.toml", "_headers", "robots.txt"):
        target = assets_dst / junk
        if target.exists():
            target.unlink()

    # --- swap the AppCompat theme parent for the framework Material theme ---
    theme_file = res_dst / "values" / "themes.xml"
    if theme_file.exists():
        text = theme_file.read_text(encoding="utf-8")
        if APPCOMPAT_PARENT in text:
            text = text.replace(APPCOMPAT_PARENT, FRAMEWORK_PARENT)
            # colorPrimary / colorPrimaryDark / colorAccent are AppCompat
            # attributes. The framework theme uses the android: namespace
            # equivalents, available since API 21.
            for attr in ("colorPrimary", "colorPrimaryDark", "colorAccent"):
                text = re.sub(
                    rf'<item name="{attr}">',
                    f'<item name="android:{attr}">',
                    text,
                )
            theme_file.write_text(text, encoding="utf-8")
            log(f"patched theme parent: {APPCOMPAT_PARENT} -> {FRAMEWORK_PARENT}")
            log("patched AppCompat color attributes to their android: equivalents")

    # --- guarantee a bitmap launcher icon for API 24-25 ---------------------
    hdpi = res_dst / "mipmap-hdpi"
    if not any((res_dst / d).exists() for d in ("mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi")):
        source_png = website / "icons" / "icon-192.png"
        if not source_png.exists():
            source_png = FALLBACK_JAVA.parent.parent / "icons" / "icon-192.png"
        if source_png.exists():
            hdpi.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_png, hdpi / "ic_launcher.png")
            log("added mipmap-hdpi/ic_launcher.png fallback for API 24-25")

    # --- patch the hardcoded session secret out of the shipped artifact ------
    bridge = java_dst / APP_ID.replace(".", os.sep) / "MainActivity.java"
    if bridge.exists():
        secret = os.environ.get("SOVEREIGN_SESSION_KEY")
        if secret:
            text = bridge.read_text(encoding="utf-8")
            text = re.sub(
                r'SESSION_SECRET = "[^"]*"',
                f'SESSION_SECRET = "{secret}"',
                text,
            )
            bridge.write_text(text, encoding="utf-8")
            log("injected SOVEREIGN_SESSION_KEY into the native bridge")

    return {
        "manifest": manifest_dst,
        "res": res_dst,
        "java": java_dst,
        "assets": assets_dst,
        "gen": gen_dst,
        "classes": classes_dst,
        "dex": dex_dst,
    }


# --------------------------------------------------------------------------- #
# build stages
# --------------------------------------------------------------------------- #
def compile_resources(toolchain: Toolchain, paths: dict, verbose: bool) -> Path:
    compiled = paths["res"].parent / "resources.zip"
    log("aapt2 compile: resources")
    run(
        [toolchain.aapt2, "compile", "--dir", str(paths["res"]), "-o", str(compiled)],
        env=toolchain.env(),
        verbose=verbose,
    )
    return compiled


def link_resources(toolchain: Toolchain, paths: dict, compiled: Path, verbose: bool) -> Path:
    unsigned = paths["assets"].parent / "unsigned.apk"
    log("aapt2 link: manifest + resources + assets")
    run(
        [
            toolchain.aapt2, "link",
            "-o", str(unsigned),
            "--manifest", str(paths["manifest"]),
            "-I", str(toolchain.android_jar),
            "-R", str(compiled),
            "--java", str(paths["gen"]),
            "-A", str(paths["assets"]),
            # The compiled resource zip is a base table, not an overlay; without
            # this flag aapt2 refuses every resource that does not "override".
            "--auto-add-overlay",
            "--min-sdk-version", MIN_SDK,
            "--target-sdk-version", TARGET_SDK,
            "--version-code", VERSION_CODE,
            "--version-name", VERSION_NAME,
            "--no-version-vectors",
        ],
        env=toolchain.env(),
        verbose=verbose,
    )
    return unsigned


def compile_java(toolchain: Toolchain, paths: dict, verbose: bool) -> int:
    sources = sorted(str(p) for p in paths["java"].rglob("*.java"))
    sources += sorted(str(p) for p in paths["gen"].rglob("*.java"))
    if not sources:
        fail("no Java sources found to compile")

    log(f"javac: compiling {len(sources)} source file(s)")
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write("\n".join(sources))
        argfile = handle.name

    try:
        run(
            [
                toolchain.javac,
                "-nowarn",
                "-encoding", "UTF-8",
                "-source", "8",
                "-target", "8",
                "-classpath", str(toolchain.android_jar),
                "-d", str(paths["classes"]),
                f"@{argfile}",
            ],
            env=toolchain.env(),
            verbose=verbose,
        )
    finally:
        try:
            os.unlink(argfile)
        except OSError:
            pass

    class_files = list(paths["classes"].rglob("*.class"))
    if not class_files:
        fail("javac produced no class files")
    log(f"javac: produced {len(class_files)} class file(s)")
    return len(class_files)


def dex(toolchain: Toolchain, paths: dict, verbose: bool) -> Path:
    class_files = sorted(str(p) for p in paths["classes"].rglob("*.class"))
    log(f"d8: dexing {len(class_files)} class file(s)")
    run(
        [
            toolchain.java, "-cp", str(toolchain.d8_jar), "com.android.tools.r8.D8",
            "--lib", str(toolchain.android_jar),
            "--min-api", MIN_SDK,
            "--output", str(paths["dex"]),
            *class_files,
        ],
        env=toolchain.env(),
        verbose=verbose,
    )
    dex_file = paths["dex"] / "classes.dex"
    if not dex_file.exists():
        fail("d8 did not produce classes.dex")
    log(f"d8: classes.dex = {dex_file.stat().st_size:,} bytes")
    return dex_file


def add_dex(unsigned: Path, dex_file: Path) -> Path:
    """Inject classes.dex into the linked APK (stored, uncompressed)."""
    packaged = unsigned.parent / "packaged.apk"
    with zipfile.ZipFile(unsigned, "r") as source, zipfile.ZipFile(packaged, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            target.writestr(item, source.read(item.filename))
        # DEX is stored uncompressed and page-aligned by zipalign afterwards.
        target.write(dex_file, "classes.dex", compress_type=zipfile.ZIP_STORED)
    log(f"packaged classes.dex into {packaged.name}")
    return packaged


def ensure_keystore(toolchain: Toolchain, work: Path) -> Path:
    keystore = work / "sovereign-debug.keystore"
    if keystore.exists():
        return keystore
    log("keytool: generating debug keystore")
    run(
        [
            toolchain.keytool,
            "-genkeypair",
            "-keystore", str(keystore),
            "-storepass", "android",
            "-keypass", "android",
            "-alias", "androiddebugkey",
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-dname", "CN=Android Debug,O=Sovereign Portal C-137,C=US",
        ],
        env=toolchain.env(),
    )
    return keystore


def zipalign(toolchain: Toolchain, packaged: Path, verbose: bool) -> Path:
    aligned = packaged.parent / "aligned.apk"
    log("zipalign: 4-byte aligning")
    run(
        [toolchain.zipalign, "-f", "-p", "4", str(packaged), str(aligned)],
        env=toolchain.env(),
        verbose=verbose,
    )
    return aligned


def sign(toolchain: Toolchain, aligned: Path, keystore: Path, output: Path, verbose: bool) -> None:
    log("apksigner: signing")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    run(
        [
            str(toolchain.apksigner), "sign",
            "--ks", str(keystore),
            "--ks-pass", "pass:android",
            "--key-pass", "pass:android",
            "--ks-key-alias", "androiddebugkey",
            "--min-sdk-version", MIN_SDK,
            "--v1-signing-enabled", "true",
            "--v2-signing-enabled", "true",
            "--out", str(output),
            str(aligned),
        ],
        env=toolchain.env(),
        verbose=verbose,
    )


def verify(toolchain: Toolchain, apk: Path, verbose: bool) -> str:
    log("apksigner: verifying")
    return run(
        [str(toolchain.apksigner), "verify", "--verbose", "--print-certs", str(apk)],
        env=toolchain.env(),
        verbose=verbose,
    )


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description="Assemble the Sovereign Portal C-137 APK without Gradle.")
    parser.add_argument("--website", default=str(ROOT / "dist" / "website"),
                        help="directory containing the built portal to bundle as assets")
    parser.add_argument("--output", default=str(DIST_ANDROID / "SovereignPortalC137.apk"))
    parser.add_argument("--keep-work", action="store_true", help="keep the temporary build tree")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    website = Path(args.website)
    if not website.is_absolute():
        website = (ROOT / website).resolve()

    output = Path(args.output)
    if not output.is_absolute():
        output = (ROOT / output).resolve()

    log("Sovereign Portal C-137 - Android APK assembler (Gradle-free)")
    log(f"app id      : {APP_ID}")
    log(f"version     : {VERSION_NAME} ({VERSION_CODE})")
    log(f"sdk         : min {MIN_SDK} / target {TARGET_SDK}")
    log(f"website     : {website}")

    toolchain = discover_toolchain()
    log(f"jdk         : {toolchain.jdk_home}")
    log(f"android sdk : {toolchain.sdk_root}")
    log(f"build-tools : {toolchain.build_tools}")

    missing = toolchain.missing()
    if missing:
        for item in missing:
            log(f"MISSING tool: {item}")
        fail(
            "toolchain incomplete. Install the missing SDK packages with:\n"
            f"    sdkmanager --sdk_root={toolchain.sdk_root} \"platform-tools\" "
            f"\"platforms;{PLATFORM}\" \"build-tools;{BUILD_TOOLS_VERSION}\""
        )

    work = Path(tempfile.mkdtemp(prefix="c137-apk-"))
    log(f"work tree   : {work}")

    try:
        paths = stage_project(work, website, toolchain)
        asset_count = sum(1 for _ in paths["assets"].rglob("*") if _.is_file())
        log(f"assets      : {asset_count} file(s) bundled into the APK")

        compiled = compile_resources(toolchain, paths, args.verbose)
        unsigned = link_resources(toolchain, paths, compiled, args.verbose)
        log(f"aapt2 link  : {unsigned.name} = {unsigned.stat().st_size:,} bytes")

        compile_java(toolchain, paths, args.verbose)
        dex_file = dex(toolchain, paths, args.verbose)
        packaged = add_dex(unsigned, dex_file)
        aligned = zipalign(toolchain, packaged, args.verbose)
        keystore = ensure_keystore(toolchain, work)
        sign(toolchain, aligned, keystore, output, args.verbose)

        verification = verify(toolchain, output, args.verbose)

        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        checksum_file = output.with_suffix(".apk.SHA256.txt")
        checksum_file.write_text(f"{digest}  {output.name}\n", encoding="utf-8")

        size = output.stat().st_size
        log("")
        log("=" * 72)
        log(f"APK         : {output}")
        log(f"size        : {size:,} bytes ({size / 1024 / 1024:.2f} MB)")
        log(f"sha256      : {digest}")
        log(f"checksum    : {checksum_file}")
        log(f"signature   : {verification.splitlines()[0] if verification else 'verified'}")
        log("install     : adb install -r " + output.name)
        log("=" * 72)
        _flush_log()
        return 0

    except Exception as error:  # noqa: BLE001
        fail(str(error))
        return 1
    finally:
        if args.keep_work:
            log(f"work tree kept at {work}")
            _flush_log()
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
