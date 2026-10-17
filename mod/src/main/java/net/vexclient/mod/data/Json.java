package net.vexclient.mod.data;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import net.vexclient.mod.VexClientMod;

import java.io.Reader;
import java.io.Writer;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Small helper for the config/vex-*.json files: atomic writes, and a broken file never crashes the game. */
public final class Json {
    private Json() {}
    public static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    public static Path file(String name) { return FabricLoader.getInstance().getConfigDir().resolve(name); }

    public static <T> T read(String name, Type type) {
        Path f = file(name);
        if (!Files.exists(f)) return null;
        try (Reader r = Files.newBufferedReader(f)) {
            return GSON.fromJson(r, type);
        } catch (Exception e) {
            VexClientMod.LOG.warn("{} is not valid JSON; keeping a copy as {}.broken and using defaults", name, name, e);
            try { Files.copy(f, f.resolveSibling(name + ".broken"), StandardCopyOption.REPLACE_EXISTING); } catch (Exception ignored) {}
            return null;
        }
    }

    public static boolean write(String name, Object data) {
        Path f = file(name);
        try {
            Files.createDirectories(f.getParent());
            Path tmp = f.resolveSibling(name + ".tmp");
            try (Writer w = Files.newBufferedWriter(tmp)) { GSON.toJson(data, w); }
            Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return true;
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not save {}", name, e);
            return false;
        }
    }
}
