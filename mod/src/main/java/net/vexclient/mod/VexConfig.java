package net.vexclient.mod;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

/** Vex Client in-game settings, saved to config/vex-client.json. */
public final class VexConfig {
    public boolean showFps = true;
    public boolean showCoords = false;
    public boolean showDirection = true;
    public boolean hudBackground = true;
    public boolean alwaysSprint = false;
    public boolean zoom = true;
    public int zoomLevel = 4;           // 2x .. 8x
    public boolean smoothZoom = true;
    public boolean vexTitleButtons = true;

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static VexConfig instance;

    private static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("vex-client.json");
    }

    public static VexConfig get() {
        if (instance == null) load();
        return instance;
    }

    public static void load() {
        VexConfig c = null;
        try {
            if (Files.exists(file())) {
                try (Reader r = Files.newBufferedReader(file())) {
                    c = GSON.fromJson(r, VexConfig.class);
                }
            }
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not read vex-client.json, using defaults", e);
        }
        instance = c != null ? c : new VexConfig();
        instance.zoomLevel = Math.max(2, Math.min(8, instance.zoomLevel));
    }

    public static void save() {
        try {
            Files.createDirectories(file().getParent());
            try (Writer w = Files.newBufferedWriter(file())) {
                GSON.toJson(get(), w);
            }
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not save vex-client.json", e);
        }
    }
}
