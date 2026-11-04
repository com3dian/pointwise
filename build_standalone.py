"""Bundle the dependency-free app into an HTML file that opens without a server."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"


def module(filename, exports):
    source = (DIST / filename).read_text()
    source = re.sub(r"^import .*?;\n", "", source, flags=re.MULTILINE)
    source = re.sub(r"\bexport (?=(?:function|const|let|class|async function)\b)", "", source)
    names = ", ".join(exports)
    return f"const {{ {names} }} = (() => {{\n{source}\nreturn {{ {names} }};\n}})();\n"


script = module("geometry.js", ["snapPoint", "routePoints", "roundedPath", "nearestOnLine", "getBounds"])
script += module("symbols.js", ["SYMBOL_TYPES", "normalizeSymbol", "normalizeSymbolColors", "renderStationSymbol", "symbolExtent", "normalizeCrossArms", "resolveCrossArms"])
script += module("labels.js", ["TEXT_DEFAULTS", "normalizeTextStyle", "labelUsesDefaults", "effectiveLabel", "labelFont", "labelLayout", "labelCapsuleBounds", "moveLabelOffset"])
script += module("shortcuts.js", ["mapZoomShortcut"])
script += module("styles.js", ["DEFAULT_STYLES", "LINE_STYLES", "CORNER_STYLES", "normalizeDefaults", "effectiveLine", "effectiveNode", "lineUsesDefaults", "crossUsesDefaults"])
script += module("strokes.js", ["renderLineStroke", "lineStrokeExtent"])
script += module("movement.js", ["routeEditHandles", "beginRoutePointEdit", "moveRoutePoint"])
script += module("topology.js", ["stationDirections"])
script += module("templates.js", ["templates"])
script += module("model.js", ["validateMap"])
script += module("export.js", ["buildSVG"])
script += module("project-file.js", ["JSONFileAutosave", "rememberProjectFile", "recallProjectFile"])
script += module("extension.js", ["lineEndpoint", "extensionAnchor", "appendRouteStop"])
script += module("deletion.js", ["removeMapItem", "repairEmptyRoutes"])
script += module("multiselect.js", ["selectionItems", "selectionKey", "isSelected", "toggleSelection", "selectedRecords", "batchStyleValue", "applyBatchStyle"])
script += re.sub(r"^import .*?;\n", "", (DIST / "app.js").read_text(), flags=re.MULTILINE)
# Escaping closing tags keeps all source inside its intended HTML element.
script = script.replace("</script", "<\\/script")
css = (DIST / "style.css").read_text().replace("</style", "<\\/style")
html = (DIST / "index.html").read_text()
html = html.replace('<link rel="stylesheet" href="./style.css">', f"<style>\n{css}\n</style>")
html = html.replace('<script type="module" src="./app.js"></script>', f'<script type="module">\n{script}\n</script>')
# Home should reload this file, rather than navigate to its containing directory.
html = html.replace('class="brand" href="./"', 'class="brand" href=""')
destination = ROOT / "Pointwise.html"
destination.write_text(html)
# Keep existing local bookmarks working after the product rename.
(ROOT / "Wayline.html").write_text(html)
print(destination)
