# luci-app-oui

Optional local vendor SVG icons beside DHCP lease hostnames. Install together with
this tree's luci-base / luci-mod-status integration. No daemon, external lookup,
or scheduled download. Optional device overrides are available for devices using OEM network modules.

The normal LuCI feature response checks for the installed helper. Without the
package, the homepage neither loads its JavaScript nor fetches the OUI database
or icons. With it, hostnames render immediately; icons are added asynchronously.
The database is fetched once per page, including caching failures, and its hash
in the filename invalidates browser caches after data updates. SVG requests are
shared by brand and use normal HTTP caching. The resident prefix table bounds
memory usage; no per-client MAC history is stored. No MAC is sent off-router.

Data comes from [WH-2099/macdb](https://github.com/WH-2099/macdb), which combines
IEEE MA-L, MA-M and MA-S assignments. Longest-prefix matching supports 24/28/36
bits. Multicast, locally administered/randomized and malformed MACs are ignored.
Unknown vendors, absent/random MACs and brands without a bundled icon use a
small generic desktop SVG. It is an original GPL-2.0-only asset, not a brand logo.
The icon identifies the registered MAC vendor: a PC using an Intel NIC can show
Intel rather than the motherboard manufacturer. DHCP hostnames are not used to
guess brands.

Most icons are an unmodified subset of
[Simple Icons 11.15.0](https://github.com/simple-icons/simple-icons/tree/11.15.0),
pinned to retain brands removed from newer releases (including Microsoft).
The included Simple Icons CC0 license and disclaimer and macdb MIT license travel
with the package. Not all hardware brands exist in this snapshot: for example,
ASRock, Gigabyte and Realme have no bundled official Simple Icons asset. They are
not relabeled as another manufacturer.

## Updating the subset

On a development machine with Python 3, unpack Simple Icons 11.15.0 and a macdb
snapshot, then run:

```sh
python3 tools/generate.py /path/to/macdb /path/to/simple-icons-11.15.0
```

`tools/vendors.json` contains normalized manufacturer alias patterns. Normalizing
case and punctuation merges ASUSTek COMPUTER INC., ASUSTeK Computer Inc., ASUS and
ASUS COMPUTER INTERNATIONAL under ASUS; patterns are anchored to avoid accidental
matches such as Pegasus or Asustor. Ambiguous matches abort generation.
`tools/sources.json` records the input CSV SHA256, source URLs, exact observed
aliases and generated database filename. Review these with any regenerated data.
Generation also updates the helper's database URL. Bump the package version and
the homepage helper query version when changing the helper or generated data.
No source downloads or Python dependency are needed when building/installing.

Run the regression checks with `python3 tools/test_generate.py` and
`node tools/test_oui.js`.

## OEM devices and supplemental brands

Midea and TCL SVGs supplement the Simple Icons subset. Their individual sources,
authors and hashes are recorded in `tools/supplemental.json` and the packaged
`NOTICE.supplemental`. These are not claimed to be Simple Icons assets.

For a known device whose MAC belongs to a module maker, add an exact device entry
to `/etc/config/oui` (vendor is the icon slug):

```uci
config device
        option mac '00:11:22:33:44:55'
        option vendor 'tcl'
```

Only that full MAC is overridden, never the module maker's entire prefix. The
configuration is preserved on upgrades and read once asynchronously through the
authenticated UCI RPC. It is not published as a static file, and no device-specific
MAC is shipped in the package. Reload the homepage after changing it.

Imilab / Chuangmi manufacturer aliases are intentionally grouped under Xiaomi
for Mi Home cameras, including all matching OUI assignments. This is a product
ecosystem grouping rather than a claim that the registered companies are identical.

Hui Zhou / Huizhou Gaoshengda aliases are intentionally grouped under TCL. This
OEM heuristic applies to all registered prefixes for that module maker, including
0C:79:55. A device override can correct exceptions using the same OEM modules.
