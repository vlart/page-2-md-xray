"""Render the X-Ray brand and toolbar mark as crisp Chrome PNG icons (macOS)."""

from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


with TemporaryDirectory() as directory:
    temporary = Path(directory)
    renderer = temporary / "render_icon"
    run(["clang", "-std=c11", str(ROOT / "scripts" / "render_icon.c"),
         "-framework", "CoreGraphics", "-framework", "CoreText",
         "-framework", "ImageIO", "-framework", "CoreFoundation",
         "-o", str(renderer)], check=True)
    run([str(renderer), str(temporary)], check=True)

    for size in (16, 32, 48, 128):
        source = temporary / ("full.png" if size == 128 else "symbol.png")
        output = ASSETS / f"icon-{size}.png"
        run(["sips", "-z", str(size), str(size), str(source), "-o", str(output)],
            check=True, capture_output=True, text=True)
        print(output)

    output = ASSETS / "icon-symbol-48.png"
    run(["sips", "-z", "48", "48", str(temporary / "symbol.png"), "-o", str(output)],
        check=True, capture_output=True, text=True)
    print(output)
