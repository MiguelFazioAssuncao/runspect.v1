#!/usr/bin/python3
"""Measure the compiler inside its PID namespace, with inherited sandbox limits."""
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    destination, *command = sys.argv[1:]
    child = subprocess.Popen(command)
    _, status, usage = os.wait4(child.pid, 0)
    child.returncode = os.waitstatus_to_exitcode(status)
    Path(destination).write_text(json.dumps({
        "cpu_ms": (usage.ru_utime + usage.ru_stime) * 1000,
        "max_rss_kb": usage.ru_maxrss,
        "resources_complete": not os.WIFSIGNALED(status),
    }))
    # Mirror a signaled compiler as a nonzero exit; the runner still reports
    # diagnostics, while a killed measuring process produces no usable report.
    return child.returncode if child.returncode >= 0 else 128 - child.returncode


if __name__ == "__main__":
    sys.exit(main())
