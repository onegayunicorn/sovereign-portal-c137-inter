#!/usr/bin/env python3
"""
Sovereign Portal C-137 — headless PortableApps (PAF 1.0) package builder.

Produces a compliant, air-gapped portable application tree from a built web/binary
payload directory. Companion to `builder_ui.py` (the interactive Tk 5-panel UI); this
CLI is what CI and `docs/EXE.md` invoke.

Generated tree:

    <output>/<Name>_<Version>/
    ├── App/
    │   ├── AppInfo/
    │   │   ├── appinfo.ini          # PAF metadata (Format 3.8)
    │   │   └── appicon.ico          # only when --icon is supplied
    │   └── <copied --source payload>
    ├── Data/
    │   ├── settings/settings.ini    # host-OS-isolated user state
    │   └── logs/build.log
    ├── Other/
    │   ├── help/help.txt
    │   └── source/README.txt
    ├── <Name>.bat                   # Windows launcher
    ├── <Name>.sh                    # Linux / macOS launcher
    ├── launch-termux.sh             # Android Termux launcher
    └── SHA256.txt                   # hash  relative/path, one per packaged file

Usage:
    python paf_builder.py --source ../../apps/web-portal --output ./Builds
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_NAME = "PortalC137Portable"
DEFAULT_VERSION = "1.0.0"
DEFAULT_PUBLISHER = "Sovereign AI Labs"
DEFAULT_CATEGORY = "Utilities"
DEFAULT_EXECUTABLE = "portal-c137.exe"
DEFAULT_HOMEPAGE = "https://sovereign.local"
DEFAULT_DESCRIPTION = "Sovereign Interactive Rick C-137 Twin Portal & Offline AI Interface"
DEFAULT_DIMENSION = "C-137"
DEFAULT_RESONANCE = 1207

PAF_FORMAT_VERSION = "3.8"

SHA_FILE = "SHA256.txt"


# --------------------------------------------------------------------------- text

def build_appinfo_ini(
    name: str,
    app_id: str,
    publisher: str,
    category: str,
    homepage: str,
    description: str,
    version: str,
    executable: str,
    language: str = "Multilingual",
) -> str:
    """Return a PortableApps.com-format `appinfo.ini` (Format 3.8)."""
    return (
        "[Format]\n"
        f"Type=PortableApps.comFormat\n"
        f"Version={PAF_FORMAT_VERSION}\n"
        "\n"
        "[Details]\n"
        f"Name={name}\n"
        f"AppID={app_id}\n"
        f"Publisher={publisher}\n"
        f"Homepage={homepage}\n"
        f"Category={category}\n"
        f"Description={description}\n"
        f"Language={language}\n"
        "\n"
        "[License]\n"
        "Shareable=true\n"
        "OpenSource=true\n"
        "Freeware=true\n"
        "CommercialUse=true\n"
        "\n"
        "[Version]\n"
        f"PackageVersion={version}.0\n"
        f"DisplayVersion={version}\n"
        "\n"
        "[Control]\n"
        "Icons=1\n"
        f"Start={executable}\n"
    )


def build_windows_launcher(name: str, executable: str) -> str:
    return (
        "@echo off\n"
        "setlocal\n"
        'set "PORTABLE_DIR=%~dp0"\n'
        f'start "" "%PORTABLE_DIR%App\\{executable}" --portable '
        '"--user-data-dir=%PORTABLE_DIR%Data\\settings"\n'
        "endlocal\n"
    )


def build_unix_launcher(executable: str) -> str:
    runtime = executable[:-4] if executable.lower().endswith(".exe") else executable
    return (
        "#!/usr/bin/env bash\n"
        'BASEDIR="$(cd "$(dirname "$0")" && pwd)"\n'
        f'chmod +x "$BASEDIR/App/{runtime}"\n'
        f'"$BASEDIR/App/{runtime}" --portable '
        '"--user-data-dir="$BASEDIR/Data/settings" "$@"\n'
    )


def build_termux_launcher() -> str:
    return (
        "#!/data/data/com.termux/files/usr/bin/bash\n"
        'BASEDIR="$(cd "$(dirname "$0")" && pwd)"\n'
        'python3 -m http.server 8080 --directory "$BASEDIR/App" &\n'
        "termux-open-url http://localhost:8080\n"
    )


def build_settings_ini(name: str, dimension: str, resonance: int) -> str:
    return (
        "; Sovereign Portal C-137 — isolated portable state\n"
        "; Lives in Data/settings; never touches %APPDATA% or the registry.\n"
        f"PortableAppName={name}\n"
        "PortableMode=true\n"
        f"Dimension={dimension}\n"
        f"ResonanceHz={resonance}\n"
        "Stability=99.87\n"
    )


def build_help_text(name: str, version: str, executable: str) -> str:
    return (
        f"{name} {version}\n"
        "=========================================================\n"
        "\n"
        "Sovereign Portal C-137 — portable edition.\n"
        "\n"
        "Windows : double-click the .bat launcher next to this folder,\n"
        f"          or run App\\{executable} --portable\n"
        "Linux   : ./<Name>.sh\n"
        "macOS   : ./<Name>.sh\n"
        "Android : bash launch-termux.sh (serves App/ on :8080)\n"
        "\n"
        "All user state is written to Data/. Close the portal before\n"
        "ejecting the USB drive.\n"
    )


# ------------------------------------------------------------------------- helpers

def _write_text(path: Path, text: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    if executable:
        try:
            os.chmod(path, 0o755)
        except OSError:
            pass  # Windows only honours the read-only bit


def _sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(block)
    return hasher.hexdigest()


def _copy_source(source: Path, dest: Path) -> int:
    """Copy `source` recursively into `dest`, skipping anything already under `dest`."""
    copied = 0
    dest_resolved = dest.resolve()
    for item in sorted(source.rglob("*")):
        if not item.is_file():
            continue
        try:
            item.resolve().relative_to(dest_resolved)
            continue  # inside the output bundle — never recurse into ourselves
        except ValueError:
            pass
        rel = item.relative_to(source)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, target)
        copied += 1
    return copied


def _supports_unicode_tree() -> bool:
    """True when stdout can encode box-drawing characters (Windows cp1252 cannot)."""
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        "├──└──│".encode(encoding)
        return True
    except (UnicodeEncodeError, LookupError):
        return False


def _render_tree(root: Path) -> str:
    if _supports_unicode_tree():
        tee, elbow, pipe, space = "├── ", "└── ", "│   ", "    "
    else:
        tee, elbow, pipe, space = "|-- ", "`-- ", "|   ", "    "

    lines = [root.name + "/"]

    def walk(directory: Path, prefix: str) -> None:
        entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        for index, entry in enumerate(entries):
            last = index == len(entries) - 1
            connector = elbow if last else tee
            lines.append(prefix + connector + entry.name + ("/" if entry.is_dir() else ""))
            if entry.is_dir():
                walk(entry, prefix + (space if last else pipe))

    walk(root, "")
    return "\n".join(lines)


# --------------------------------------------------------------------------- build

def build_paf(
    source: Path | None,
    output: Path,
    name: str = DEFAULT_NAME,
    version: str = DEFAULT_VERSION,
    publisher: str = DEFAULT_PUBLISHER,
    category: str = DEFAULT_CATEGORY,
    executable: str = DEFAULT_EXECUTABLE,
    homepage: str = DEFAULT_HOMEPAGE,
    description: str = DEFAULT_DESCRIPTION,
    dimension: str = DEFAULT_DIMENSION,
    resonance: int = DEFAULT_RESONANCE,
    icon: Path | None = None,
    make_zip: bool = False,
    verbose: bool = True,
) -> Path:
    """Build the PAF bundle and return the bundle root path."""
    app_id = "".join(ch for ch in name if ch.isalnum())
    bundle = Path(output).expanduser().resolve() / f"{name}_{version}"

    app_dir = bundle / "App"
    appinfo_dir = app_dir / "AppInfo"
    data_dir = bundle / "Data"
    settings_dir = data_dir / "settings"
    logs_dir = data_dir / "logs"
    other_dir = bundle / "Other"
    help_dir = other_dir / "help"
    source_dir = other_dir / "source"

    for directory in (app_dir, appinfo_dir, data_dir, settings_dir, logs_dir,
                      other_dir, help_dir, source_dir):
        directory.mkdir(parents=True, exist_ok=True)

    # --- metadata ---------------------------------------------------------
    appinfo_ini = build_appinfo_ini(
        name=name,
        app_id=app_id,
        publisher=publisher,
        category=category,
        homepage=homepage,
        description=description,
        version=version,
        executable=executable,
    )
    _write_text(appinfo_dir / "appinfo.ini", appinfo_ini)

    if icon is not None and Path(icon).exists():
        shutil.copy2(Path(icon), appinfo_dir / "appicon.ico")

    # --- payload ----------------------------------------------------------
    copied = 0
    if source is not None:
        source_path = Path(source).expanduser()
        if source_path.is_dir():
            copied = _copy_source(source_path, app_dir)
        else:
            print(f"[warn] --source is not a directory, skipping: {source_path}", file=sys.stderr)

    # --- isolated state ---------------------------------------------------
    _write_text(settings_dir / "settings.ini", build_settings_ini(name, dimension, resonance))
    _write_text(
        logs_dir / "build.log",
        f"[{datetime.now(timezone.utc).isoformat()}] built {name} {version} "
        f"(paf format {PAF_FORMAT_VERSION}, {copied} payload files)\n",
    )

    # --- launchers --------------------------------------------------------
    _write_text(bundle / f"{name}.bat", build_windows_launcher(name, executable))
    _write_text(bundle / f"{name}.sh", build_unix_launcher(executable), executable=True)
    _write_text(bundle / "launch-termux.sh", build_termux_launcher(), executable=True)

    # --- docs -------------------------------------------------------------
    _write_text(help_dir / "help.txt", build_help_text(name, version, executable))
    _write_text(
        source_dir / "README.txt",
        "Source payload is copied verbatim into App/ at build time.\n"
        f"Source: {Path(source).resolve() if source else '(none)'}\n",
    )

    # --- SHA256 manifest --------------------------------------------------
    manifest_lines: list[str] = []
    for file_path in sorted(bundle.rglob("*")):
        if not file_path.is_file() or file_path.name == SHA_FILE:
            continue
        rel = file_path.relative_to(bundle).as_posix()
        manifest_lines.append(f"{_sha256_file(file_path)}  {rel}")
    _write_text(bundle / SHA_FILE, "\n".join(manifest_lines) + "\n")

    # --- optional zip -----------------------------------------------------
    if make_zip:
        archive = bundle.parent / f"{name}_{version}.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in sorted(bundle.rglob("*")):
                if file_path.is_file():
                    zf.write(file_path, file_path.relative_to(bundle.parent).as_posix())
        if verbose:
            print(f"[zip] {archive}")

    if verbose:
        print(f"[ok] PAF bundle: {bundle}")
        print(f"[ok] payload files copied: {copied}")
        print(f"[ok] manifest entries: {len(manifest_lines)}")
        print()
        print(_render_tree(bundle))

    return bundle


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="paf_builder",
        description="Build a PortableApps (PAF 1.0) package for Sovereign Portal C-137.",
    )
    parser.add_argument("--source", type=Path, default=None,
                        help="Directory whose contents are copied into App/ (e.g. a built web bundle).")
    parser.add_argument("--output", type=Path, required=True,
                        help="Base output directory; the bundle is created at <output>/<Name>_<Version>.")
    parser.add_argument("--name", default=DEFAULT_NAME, help="PortableApp name / AppID.")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="SemVer version.")
    parser.add_argument("--publisher", default=DEFAULT_PUBLISHER, help="Publisher name.")
    parser.add_argument("--category", default=DEFAULT_CATEGORY, help="PortableApps category.")
    parser.add_argument("--executable", default=DEFAULT_EXECUTABLE, help="Launch executable name.")
    parser.add_argument("--homepage", default=DEFAULT_HOMEPAGE, help="Homepage URL.")
    parser.add_argument("--description", default=DEFAULT_DESCRIPTION, help="App description.")
    parser.add_argument("--dimension", default=DEFAULT_DIMENSION, help="Default dimension (default C-137).")
    parser.add_argument("--resonance", type=int, default=DEFAULT_RESONANCE, help="Resonance Hz (default 1207).")
    parser.add_argument("--icon", type=Path, default=None, help="Optional .ico copied to App/AppInfo/appicon.ico.")
    parser.add_argument("--zip", action="store_true", help="Also produce a .zip distribution next to the bundle.")
    parser.add_argument("--quiet", action="store_true", help="Suppress the progress/tree output.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    build_paf(
        source=args.source,
        output=args.output,
        name=args.name,
        version=args.version,
        publisher=args.publisher,
        category=args.category,
        executable=args.executable,
        homepage=args.homepage,
        description=args.description,
        dimension=args.dimension,
        resonance=args.resonance,
        icon=args.icon,
        make_zip=args.zip,
        verbose=not args.quiet,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
