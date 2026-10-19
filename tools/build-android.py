#!/usr/bin/env python3
"""Build the offline Android APK with an installed JDK and Android SDK 35."""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", default=os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT"))
    parser.add_argument("--java-home", default=os.environ.get("JAVA_HOME"))
    parser.add_argument("--output", default="downloads/zasvet-android.apk")
    args = parser.parse_args()
    if not args.sdk or not args.java_home:
        parser.error("Set ANDROID_HOME and JAVA_HOME, or use --sdk and --java-home.")
    sdk = Path(args.sdk).resolve()
    java_bin = Path(args.java_home).resolve() / "bin"
    suffix = ".exe" if os.name == "nt" else ""
    java = java_bin / ("java" + suffix)
    javac = java_bin / ("javac" + suffix)
    keytool = java_bin / ("keytool" + suffix)
    build_tools = sdk / "build-tools/35.0.0"
    android_jar = sdk / "platforms/android-35/android.jar"
    aapt = build_tools / ("aapt2" + suffix)
    zipalign = build_tools / ("zipalign" + suffix)
    d8 = build_tools / "lib/d8.jar"
    signer = build_tools / "lib/apksigner.jar"
    for tool in (java, javac, keytool, android_jar, aapt, zipalign, d8, signer):
        if not tool.is_file():
            parser.error(f"Missing build tool: {tool}")

    build = ROOT / "android/build" / uuid.uuid4().hex
    classes, dex = build / "classes", build / "dex"
    classes.mkdir(parents=True)
    dex.mkdir()
    output = (ROOT / args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    unsigned, aligned, signed = (build / name for name in ("unsigned.apk", "aligned.apk", "signed.apk"))

    print("Compiling Android resources and Java host…", flush=True)
    run(aapt, "compile", "--dir", ROOT / "android/res", "-o", build / "resources.zip")
    run(aapt, "link", "-o", unsigned, "-I", android_jar,
        "--manifest", ROOT / "android/AndroidManifest.xml", build / "resources.zip")
    run(javac, "--release", "8", "-encoding", "UTF-8", "-classpath", android_jar,
        "-d", classes, ROOT / "android/src/ru/raistaid/zasvet/MainActivity.java")
    with zipfile.ZipFile(build / "classes.jar", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(classes.rglob("*.class")):
            archive.write(file, file.relative_to(classes).as_posix())
    run(java, "-cp", d8, "com.android.tools.r8.D8", "--release", "--min-api", "26",
        "--lib", android_jar, "--output", dex, build / "classes.jar")
    with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(dex / "classes.dex", "classes.dex")
        for file in sorted((ROOT / "game").rglob("*")):
            if file.is_file() and file.name != ".DS_Store":
                if file.is_symlink():
                    raise ValueError(f"Cannot package a symlink: {file}")
                archive.write(file, "assets/" + file.relative_to(ROOT / "game").as_posix())
    run(zipalign, "-P", "16", "-f", "4", unsigned, aligned)

    # Kept locally between builds and excluded from Git; never shipped in the APK.
    keystore = ROOT / ".local/android-signing/zasvet.p12"
    if not keystore.exists():
        keystore.parent.mkdir(parents=True, exist_ok=True)
        run(keytool, "-genkeypair", "-keystore", keystore, "-storetype", "PKCS12",
            "-storepass", "android", "-keypass", "android", "-alias", "zasvet",
            "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
            "-dname", "CN=Zasvet,O=Local Build,C=RU", "-noprompt")
        keystore.chmod(0o600)
    print("Signing and verifying APK…", flush=True)
    run(java, "-jar", signer, "sign", "--ks", keystore, "--ks-key-alias", "zasvet",
        "--ks-pass", "pass:android", "--key-pass", "pass:android",
        "--v1-signing-enabled", "true", "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true", "--out", signed, aligned)
    run(java, "-jar", signer, "verify", "--verbose", signed)
    run(zipalign, "-c", "-P", "16", "4", signed)
    run(aapt, "dump", "badging", signed)
    shutil.copyfile(signed, output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    print(f"APK ready: {output}\nSHA256: {digest}")


if __name__ == "__main__":
    main()
