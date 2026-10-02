# `portable-builder` — Sovereign Portal C-137 PortableApps (PAF 1.0) packager

Air-gapped, USB-runnable distributions of the Sovereign Portal C-137 with **zero
registry writes** and **zero `%APPDATA%` leakage**. Ships two front-ends:

| File | Role |
| --- | --- |
| `builder_ui.py` | Interactive Tk 5-panel desktop builder (blueprint §9.1) |
| `paf_builder.py` | Headless CLI builder (used by CI / `docs/EXE.md`) |

## Generated PAF layout

```
<Name>_<Version>/
├── App/
│   ├── AppInfo/
│   │   ├── appinfo.ini          # PAF Format 3.8 metadata
│   │   └── appicon.ico          # only with --icon
│   └── <copied payload>
├── Data/
│   ├── settings/settings.ini    # host-OS-isolated user state
│   └── logs/build.log
├── Other/
│   ├── help/help.txt
│   └── source/README.txt
├── <Name>.bat                   # Windows launcher
├── <Name>.sh                    # Linux / macOS launcher
├── launch-termux.sh             # Android Termux launcher
└── SHA256.txt                   # "<hash>  <relative/path>" for every packaged file
```

## CLI usage

```bash
python apps/portable-builder/paf_builder.py \
  --source apps/web-portal \
  --output ./Builds
```

Full option list:

```bash
python apps/portable-builder/paf_builder.py --help
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--source` | *(none)* | Directory copied verbatim into `App/` |
| `--output` | *(required)* | Base dir; bundle created at `<output>/<Name>_<Version>` |
| `--name` | `PortalC137Portable` | App name + AppID |
| `--version` | `1.0.0` | SemVer |
| `--publisher` | `Sovereign AI Labs` | Publisher |
| `--category` | `Utilities` | PortableApps category |
| `--executable` | `portal-c137.exe` | Launcher target |
| `--dimension` | `C-137` | Written into `Data/settings/settings.ini` |
| `--resonance` | `1207` | Written into `Data/settings/settings.ini` |
| `--icon` | *(none)* | `.ico` copied to `App/AppInfo/appicon.ico` |
| `--zip` | off | Also emit `<Name>_<Version>.zip` |
| `--quiet` | off | Suppress progress output |

Example with the Tauri icon and a zip:

```bash
python apps/portable-builder/paf_builder.py \
  --source apps/web-portal \
  --output ./Builds \
  --icon apps/desktop-tauri/src-tauri/icons/icon.ico \
  --zip
```

## GUI usage

```bash
python apps/portable-builder/builder_ui.py
```

Fill **1. App Metadata**, then press **BUILD PAF DIRECTORY STRUCTURE** on the
**2. Package & Build** panel. Requires Tk (bundled with the standard CPython
Windows/macOS installers; on Debian/Ubuntu install `python3-tk`).

## Verification

```bash
# 1. Syntax check both modules
python -c "import ast; ast.parse(open('apps/portable-builder/paf_builder.py', encoding='utf-8').read())"

# 2. Build a scratch bundle and inspect the tree
python apps/portable-builder/paf_builder.py --source apps/portable-builder --output ./paf-test

# 3. Verify the manifest
Get-ChildItem -Recurse ./paf-test | Select-Object FullName
Get-Content ./paf-test/PortalC137Portable_1.0.0/SHA256.txt
```

## Notes

- The block above (`App/AppInfo/appinfo.ini`) follows blueprint §9.1. Official
  PortableApps.com PAF places `AppInfo/` at the bundle root; if you need strict
  upstream compliance, move the directory up one level — the `[Control]` section is
  identical either way.
- `SHA256.txt` is regenerated last and excludes itself.
- `--source` files are copied with `shutil.copy2`, preserving timestamps.
