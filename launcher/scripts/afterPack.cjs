// Embeds the VEX icon and version info into VEX CLIENT.exe with resedit (pure JS),
// so the desktop/start-menu shortcuts show the VEX logo even when building without Wine.
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== "win32") return;
  const ResEdit = await import("resedit");
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const ico = path.join(ctx.packager.projectDir, "build", "icon.ico");
  const version = ctx.packager.appInfo.version;

  const res = ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true }));
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
  // Replace Electron's default icon group (id 1) with ours.
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icon.icons.map((i) => i.data));

  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (vi) {
    const [a, b, c] = version.split(".").map(Number);
    vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      ProductName: "VEX CLIENT", FileDescription: "VEX CLIENT", CompanyName: "Albatron2580",
      OriginalFilename: "VEX CLIENT.exe", InternalName: "VEX CLIENT", LegalCopyright: "VEX CLIENT",
    });
    vi.outputToResourceEntries(res.entries);
  }
  const newBin = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  res.outputResource(newBin);
  fs.writeFileSync(exe, Buffer.from(newBin.generate()));
  console.log(`  • embedded VEX icon into ${path.basename(exe)}`);
};
