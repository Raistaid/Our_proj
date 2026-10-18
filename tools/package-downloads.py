#!/usr/bin/env python3
"""Create reproducible game and Android source ZIPs without building an APK."""

import argparse
import io
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ANDROID_FILES = (
    ".gitattributes", ".gitignore", "README.md", "README.upstream.md", "UPSTREAM.md", "CONTEXT.md",
    "build.gradle.kts", "settings.gradle.kts", "gradle.properties", "gradlew", "gradlew.bat",
    "app/.gitignore", "app/build.gradle.kts",
)


def files_in(directory):
    for path in sorted(directory.rglob("*")):
        if path.is_file() and path.name != ".DS_Store":
            if path.is_symlink():
                raise ValueError(f"Symlink cannot be packaged: {path}")
            yield path


def archive(entries):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for name, path in sorted(entries):
            if path.suffix in (".apk", ".aab", ".jks", ".keystore"):
                raise ValueError(f"Not a source file: {path}")
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if path.name == "gradlew" else 0o100644) << 16
            zipped.writestr(info, path.read_bytes(), compresslevel=9)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if committed ZIPs are outdated")
    args = parser.parse_args()
    game_files = [(path.relative_to(ROOT / "game").as_posix(), path) for path in files_in(ROOT / "game")]
    android_files = [ROOT / "android-sandbox" / name for name in ANDROID_FILES]
    for folder in ("app/src", "gradle"):
        android_files.extend(files_in(ROOT / "android-sandbox" / folder))
    android_entries = [
        ("zasvet-android/android-sandbox/" + path.relative_to(ROOT / "android-sandbox").as_posix(), path)
        for path in android_files
    ]
    android_entries.extend(("zasvet-android/game/" + name, path) for name, path in game_files)
    for filename, entries in (("zasvet-game.zip", game_files), ("zasvet-android.zip", android_entries)):
        destination = ROOT / "downloads" / filename
        data = archive(entries)
        if args.check:
            if not destination.is_file() or destination.read_bytes() != data:
                parser.exit(1, f"Outdated {filename}; run python3 tools/package-downloads.py\n")
        else:
            destination.parent.mkdir(exist_ok=True)
            destination.write_bytes(data)
        print(f"{'OK' if args.check else 'Created'} {filename}: {len(entries)} files, {len(data)} bytes")


if __name__ == "__main__":
    main()
