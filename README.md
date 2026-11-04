# Pointwise

A browser-based editor for flowcharts that speak the visual language of metro maps. Create colored routes, add stops and interchanges, and attach useful information to each station.

The interface uses compact property rows and editable name headings. Station labels are 24 map units; SVG exports use a 48-unit title and 21-unit subtitles/legends. Station-label clearance and export bounds account for the larger text.

## Run locally

Open **Pointwise.html** in your browser. This self-contained version works without a server or installation. After changing source files, regenerate it with `python3 build_standalone.py`. The builder also updates **Wayline.html** so existing local bookmarks keep working.

There is no installation or build step. Serve the `dist` directory over HTTP:

```sh
cd "/Users/com3dian/Github/metro map/wayline"
python3 -m http.server 8080 --directory dist
```

Open [localhost:8080](http://localhost:8080). The app uses browser-native JavaScript modules, so opening `index.html` directly from the filesystem is not supported.

Use the header's **Lines** and **Properties** panel buttons to show or hide either sidebar independently, or press `[` and `]`. **Present fullscreen** (`\`) opens a read-only presentation; click stops to read their descriptions. Exit presentation to restore your workspace. Drawing tools, undo/redo, and zoom share one floating bottom toolbar. The canvas fills the window behind compact corner controls. New routes use a 6-unit stroke. Panel preferences are remembered in this browser. Both panels share compact typography and 36-pixel rows, with larger touch targets on touch devices. Station properties are split into Style and Content tabs.

When nothing is selected, the Properties panel shows editable **Project title** and **Subtitle** fields and a line/stop count. Click empty canvas, press Escape, or close the selected item's details to return to project information. **Canvas → Project info** in the Lines panel opens the same editor and reveals the Properties panel if needed. Project edits save automatically using the existing browser/file autosave and support Undo, JSON backups, and SVG export.

## Working with a map

- Start with an example or choose a blank canvas.
- Use the line tool to draw a route. Click to place stops; connect to an existing station to create an interchange. Finish the route with Enter or Escape.
- Use the stop tool to add a station to an existing route.
- Select stations and drag them to rearrange the map. Route geometry follows metro-style horizontal, vertical, and diagonal segments.
- Hold **Shift** and click stops or lines to add/remove them from a selection. This also works in the Lines panel. Use the right panel to change selected stops' text/symbols or selected lines' colors, patterns, weight and corners together. Differing properties show **Mixed**; editing one leaves other properties unchanged. Each batch change is one Undo step. Click normally to select one item, or press Escape to clear the selection. While drawing, Shift-click still places a route bend.
- Select a station to edit its name and information in the inspector. Select a line to edit its appearance.
- Pan and zoom to move around the canvas. Use undo and redo to revisit recent edits.
- Use presentation mode to explore the map and its station information.

The app saves your current map in local browser storage. This storage belongs to the current browser and site origin; it does not synchronize between devices. Export a JSON file to keep a portable, editable backup, then import it when you want to continue elsewhere. SVG export produces a scalable drawing for sharing or further visual editing.

The included templates are examples of conceptual flowcharts, not real transport maps.

## Presentation and Markdown descriptions

Select a stop and open **Content → Description** to write Markdown. Expand **Preview** to see the formatting as you type. Headings, bold/italic text, lists, task lists, links, blockquotes, tables, inline code, and fenced code blocks are supported. Descriptions are retained in browser recovery saves and JSON projects.

Click the fullscreen icon or press `\` to present. Editing panels, drawing tools, route handles, and edit shortcuts are disabled. Click a stop or its name to read its description in a card above the stop; near the top edge the card moves below to stay visible. Close the card with its × button or click elsewhere on the canvas. Drag empty canvas or a route to pan, scroll or use Ctrl/Cmd +/− to zoom, and press F to fit the map. **Exit presentation**, Escape, or leaving native fullscreen restores your panels, selection, camera, inspector tab, and scroll position. If native fullscreen is unavailable, the same read-only presentation uses the browser window.

Markdown is rendered with a bundled copy of [Marked](https://marked.js.org/), pinned to version 18.1.3, so no CDN or installation is needed. Its MIT license is included in `dist/vendor/marked.LICENSE.md` and the standalone HTML. Raw HTML is displayed as text; Markdown images are shown as explicit links.

## Corners and station symbols

Select a line, then choose **Corner shape**: Sharp, Soft curve, Circular, or Beveled. Corner radius spans 0–160 map units, with numeric shortcuts. Sharp corners ignore radius; zero radius makes any corner sharp. Choose 45° diagonal or 90° right-angle route geometry. Rounding tightens near stops so they stay connected; use Shift-click while drawing to add a route bend for a broader curve.

Select a station, then open **Station appearance**. The twelve base symbols include circles, filled dots, capsules, open capsules, capsules with route dots, linked circles, linked route dots, touching circles, crosses, segmented rings, and orbital rings. Rotate elongated markers 90° for vertical links or 45° for diagonal links. Size, connector length, outline, and interior controls provide the variations shown in transit-map design studies; rotation and connector controls appear when relevant. Automatic markers adapt to line membership.

Appearance changes support undo and are retained in browser saves, JSON files, and SVG exports. Older map files remain compatible.

Legend swatches and station-picker previews use grayscale; routes on the map retain their colors. Directional station symbols have a Rotation slider and exact angle field at the top of Station appearance.

Cross stops default to **Follow connected lines**. Their arms follow the actual incoming and outgoing route segments, including diagonal crossings and T-junctions. Choose **Adjust these arms** (or **Adjust arms individually**) to edit each arm’s angle and length, add arms, or remove them. **Match lines again** restores automatic alignment and resets the overall rotation. Manual arm angles are measured before overall symbol rotation; in map coordinates, 0° points right and 90° points down.

## Reshape a route and share a style

In Select mode, select a line to see its diamond handles. Drag a handle or any route segment to create or move a local bend point. Existing stations, interchanges, and other routes stay fixed; only the neighboring stretch of the selected route changes. A click without dragging only selects the line. Double-click a bend, press Delete with a bend selected, or use Remove selected bend to straighten that part again. Escape cancels an in-progress bend drag; Undo restores a complete drag in one step. Handles support arrow keys (Shift for fine movement), and all bend edits save in JSON and SVG exports.

Open **Global style** in the Lines panel. Set route geometry, corner shape/radius, line weight, and Solid, Dashed, Dotted, Double track, Triple track, or Outlined patterns. The same panel sets shared cross size, arm reach/width, corner treatment, outline, and interior. Cross corners can match the route corner style; automatic cross arms continue following the actual route directions.

Lines with **Use map defaults** enabled update when these settings change. Editing a line’s appearance creates an override for that line. Enable the checkbox again to relink it. Cross stops have an independent **Use map cross style** checkbox, while their rotation and manually fitted arms remain local. **Apply defaults to every line/cross** clears appearance overrides in that group. Shared styles also apply to newly drawn lines; colors and content remain specific to each line and station. Defaults and overrides are saved in JSON and SVG exports.

## Stop-name typography and placement

The bottom toolbar contains selection, line and stop tools; pan by dragging empty canvas, holding Space, or using the middle mouse button.

Select a stop, then use **Style → Text** to change typeface, size, weight, angle, alignment and gap. **45° from stop** starts the name just outside the symbol and extends it diagonally. **Name position** sets a side of the stop; **Offset X/Y** makes precise adjustments. Drag the name itself to move only the text. Drag the symbol to move the stop with its name; the relative offset is retained. Arrow keys nudge a focused name, with Shift for fine movement. Reset name position clears the offsets.

**Global style → Stop names** sets shared typography. Editing a stop creates a local text override; enable **Use global text style** to relink it. **Apply text style to every stop** clears text-style overrides while preserving individual offsets and names. Typography and placement support Undo, browser saves, JSON files and SVG exports.

Under **Text → Name shape**, choose **Capsule** to put a rounded background around a stop name. Adjust its fill, outline, padding, and border width using the shared color palette and property fields. Auto fill follows the map background; Auto outline follows the text color. The capsule rotates and drags with the name, without moving the station. This setting is available locally, for Shift-selected stops, and under **Global style → Stop names**; it is included in JSON saves and SVG exports.

**Ctrl/Cmd +** (or **Ctrl/Cmd =**) and **Ctrl/Cmd −** zoom the map using the bottom toolbar's zoom steps, keeping the interface at its current size. The shortcuts also work while a property field is focused.

## Autosave to a JSON project file

Open **Project file → Open JSON** to link an existing project, or **Save as…** to choose a JSON destination for the current map. In browsers that support native file pickers (such as Chrome and Edge), Pointwise writes edits to that same file after a brief pause. Ctrl/Cmd+S saves immediately. The file handle is remembered in IndexedDB; if the browser requires fresh permission after a restart, use **Reconnect file** in Project file. A new map or a different JSON import disconnects the previous file. Download a copy creates an independent backup without changing the autosave destination.

Firefox and other browsers without native file-picker access keep browser recovery saves and offer manual JSON downloads; they cannot overwrite an opened local JSON file automatically. An ordinary HTML file-upload input also cannot grant write-back access: select the file through Open JSON in a supporting browser, or use Save as once.

The Project file indicator reports pending, saved, paused, and error states. Writes are serialized, and an externally modified file pauses autosave so it is not silently overwritten. A browser recovery copy is still saved independently. Keep the page open until pending file saves finish.

## Continue from either end

In Select mode, click either end stop, then use the **+ Continue line** button beside it (or in the inspector). Click the canvas to add stops and press Enter or Escape to finish. Continuing from the first stop prepends new stops without reversing the existing route; continuing from the last appends them. If several lines end at that stop, choose which line to extend. Interior stops and closed loops do not show endpoint actions. Existing station dragging and name placement still work normally.

## Colors and compact appearance sections

Text, Station appearance, and Line appearance sections start collapsed for each newly selected item. Expand a section to edit it; it stays open while you change that item's controls. Names are editable headings, station symbols use a compact two-row picker, and rotation/connector controls appear only for symbols that use them.

Every color swatch opens the same shared metro palette: eight route colors plus neutral, gray, white, and black. This chooser is shared by lines, text, station outlines/interiors, and global style colors. Choose **Custom color** for the native picker or enter an exact hex value alongside the swatch.

Under **Text**, choose a text color with the swatch or a six-digit hex value. **Auto** restores theme-aware map ink. Under **Station appearance**, click the always-visible **Outline color** swatch or enter a hex value; this switches the outline to Custom color automatically, including Automatic stops. The color controls sit at the top of the section. Interior colors work the same way for symbols with editable interiors. Cross outlines and interiors can be colored independently. **Global style** includes the same cross and text color defaults; existing local overrides remain independent. Colors are retained in JSON and SVG exports and file autosaves.
