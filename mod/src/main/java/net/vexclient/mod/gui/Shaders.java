package net.vexclient.mod.gui;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.screens.Screen;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipFile;

/**
 * Shader packs through Iris. Uses Iris's public API (net.irisshaders.iris.api.v0) where it can, and Iris's
 * own config class for picking a pack. Everything is reflective so the mod works without Iris installed.
 */
public final class Shaders {
    private Shaders() {}

    public record Pack(String name, boolean folder, String warning) {}

    public static boolean irisLoaded() { return FabricLoader.getInstance().isModLoaded("iris"); }
    public static boolean sodiumLoaded() { return FabricLoader.getInstance().isModLoaded("sodium"); }

    public static String irisVersion() {
        return FabricLoader.getInstance().getModContainer("iris").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse(null);
    }

    public static Path dir() { return FabricLoader.getInstance().getGameDir().resolve("shaderpacks"); }

    public static List<Pack> packs() {
        List<Pack> out = new ArrayList<>();
        try {
            if (!Files.isDirectory(dir())) return out;
            try (var s = Files.list(dir())) {
                for (Path p : s.sorted().toList()) {
                    String n = p.getFileName().toString();
                    if (Files.isDirectory(p)) out.add(new Pack(n, true, Files.isDirectory(p.resolve("shaders")) ? null : "No shaders/ folder inside: probably not a shader pack"));
                    else if (n.toLowerCase().endsWith(".zip")) out.add(new Pack(n, false, zipWarning(p)));
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    private static String zipWarning(Path p) {
        try (ZipFile z = new ZipFile(p.toFile())) {
            var en = z.entries();
            while (en.hasMoreElements()) {
                String n = en.nextElement().getName();
                if (n.startsWith("shaders/") || n.matches("[^/]+/shaders/.*")) return null;
            }
            return "No shaders/ folder inside: not a shader pack (a resource pack?)";
        } catch (Exception e) {
            return "Can't open this zip (damaged?)";
        }
    }

    private static Object apiConfig() throws Exception {
        Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
        Object inst = api.getMethod("getInstance").invoke(null);
        return api.getMethod("getConfig").invoke(inst);
    }

    /** null when Iris is missing or the API call fails. */
    public static Boolean enabled() {
        if (!irisLoaded()) return null;
        try { Object c = apiConfig(); return (Boolean) c.getClass().getMethod("areShadersEnabled").invoke(c); }
        catch (Throwable t) { return null; }
    }

    /** Returns an error message or null. */
    public static String setEnabled(boolean on) {
        if (!irisLoaded()) return "Iris isn't installed";
        try { Object c = apiConfig(); c.getClass().getMethod("setShadersEnabledAndApply", boolean.class).invoke(c, on); return null; }
        catch (Throwable t) { return "Iris refused: " + rootMessage(t); }
    }

    /** The pack Iris has selected (from Iris's own config), or null. */
    public static String selected() {
        if (!irisLoaded()) return null;
        try {
            Class<?> iris = Class.forName("net.irisshaders.iris.Iris");
            Object cfg = iris.getMethod("getIrisConfig").invoke(null);
            Object o = cfg.getClass().getMethod("getShaderPackName").invoke(cfg);
            if (o instanceof java.util.Optional<?> opt) return opt.map(String::valueOf).orElse(null);
            return o == null ? null : o.toString();
        } catch (Throwable t) { return null; }
    }

    /** Picks a pack, turns shaders on and reloads. Returns an error message or null. */
    public static String select(String name) {
        if (!irisLoaded()) return "Iris isn't installed";
        try {
            Class<?> iris = Class.forName("net.irisshaders.iris.Iris");
            Object cfg = iris.getMethod("getIrisConfig").invoke(null);
            cfg.getClass().getMethod("setShaderPackName", String.class).invoke(cfg, name);
            try { cfg.getClass().getMethod("setShadersEnabled", boolean.class).invoke(cfg, true); } catch (NoSuchMethodException ignored) {}
            cfg.getClass().getMethod("save").invoke(cfg);
            Method reload = iris.getMethod("reload");
            reload.invoke(null);
            return null;
        } catch (Throwable t) {
            return "This Iris version didn't accept it (" + rootMessage(t) + "). Use Iris's own shader screen instead.";
        }
    }

    /** Iris's own shader pack screen, or null. */
    public static Screen irisScreen(Screen parent) {
        if (!irisLoaded()) return null;
        try {
            Class<?> api = Class.forName("net.irisshaders.iris.api.v0.IrisApi");
            Object inst = api.getMethod("getInstance").invoke(null);
            Object s = api.getMethod("openMainIrisScreenObj", Object.class).invoke(inst, parent);
            return s instanceof Screen sc ? sc : null;
        } catch (Throwable t) { return null; }
    }

    public static void openFolder() {
        try {
            Files.createDirectories(dir());
            net.minecraft.Util.getPlatform().openPath(dir());
        } catch (Throwable ignored) {}
    }

    private static String rootMessage(Throwable t) {
        while (t.getCause() != null) t = t.getCause();
        return t.getClass().getSimpleName() + (t.getMessage() != null ? ": " + t.getMessage() : "");
    }
}
