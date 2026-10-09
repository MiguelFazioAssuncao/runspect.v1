#!/usr/bin/python3
"""Build trusted standard-library PCHs once, while building the Docker image."""
import argparse
from pathlib import Path
import subprocess

from instrument_cpp import compiler_options, load_clang


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cache")
    parser.add_argument("--runtime", default="")
    args = parser.parse_args()
    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    header = cache / "stdlib.h"
    header.write_text("#include <bits/stdc++.h>\n")
    ci, resources = load_clang(args.runtime)
    options = compiler_options(resources)
    options[2] = "c++-header"
    unit = ci.Index.create().parse(str(header), args=options)
    errors = [str(d) for d in unit.diagnostics if d.severity >= ci.Diagnostic.Error]
    if errors:
        raise RuntimeError("\n".join(errors))
    unit.save(str(cache / "stdlib.pch"))
    # A private include directory keeps the system toolchain untouched. GCC
    # rejects incompatible PCHs and falls back to the ordinary wrapper header.
    headers = sorted(Path("/usr/include").glob("**/c++/*/bits/stdc++.h"), key=lambda p: int(p.parts[-3]))
    if not headers:
        raise RuntimeError("GCC standard-library header bits/stdc++.h not found")
    gcc_header = cache / "bits/stdc++.h"
    gcc_header.parent.mkdir(exist_ok=True)
    gcc_header.write_text(f'#include "{headers[-1]}"\n')
    subprocess.run(["g++", "-O0", "-pipe", "-std=c++17", "-x", "c++-header", str(gcc_header), "-o", str(gcc_header) + ".gch"], check=True)


if __name__ == "__main__":
    main()
