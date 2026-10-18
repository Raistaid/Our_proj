#!/usr/bin/env python3
"""Build and test the iOS sandbox on an installed iPhone simulator, without signing."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    subprocess.run(["xcodebuild", "-version"], check=True)
    devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "--json"]))
    candidates = [
        (tuple(int(part) for part in re.findall(r"\d+", runtime)), device)
        for runtime, entries in devices["devices"].items() if ".iOS-" in runtime
        for device in entries if device.get("isAvailable") and device["name"].startswith("iPhone")
    ]
    if not candidates:
        raise SystemExit("Install an iPhone simulator runtime in Xcode > Settings > Components.")
    _, device = max(candidates, key=lambda item: (item[0], item[1]["name"]))
    print(f"Testing on {device['name']} ({device['udid']})", flush=True)
    output = Path(tempfile.mkdtemp(prefix="zasvet-ios-", dir=os.environ.get("RUNNER_TEMP")))
    subprocess.run([
        "xcodebuild", "test", "-quiet",
        "-project", str(ROOT / "ios-sandbox/HackathonSandbox.xcodeproj"),
        "-scheme", "HackathonSandbox",
        "-destination", f"platform=iOS Simulator,id={device['udid']}",
        "-parallel-testing-enabled", "NO",
        "-derivedDataPath", str(output / "DerivedData"),
        "-resultBundlePath", str(output / "TestResults.xcresult"),
        "CODE_SIGNING_ALLOWED=NO",
    ], check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
