package net.vexclient.mod.gui;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Translations for the VEX menus. Texts are written in English in the code; L.t("English") returns the
 * text in the language picked in Minecraft (Options › Language) when VEX has it, otherwise the English.
 * The translations live in assets/vexclient/vexlang/&lt;language&gt;.json ("English": "translation").
 * "{0}", "{1}" are filled in with the extra values: L.t("Added {0}", name).
 */
public final class L {
    private L() {}

    private static String loadedFor = null;
    private static Map<String, String> dict = Map.of();

    /** Minecraft's language code (de_de, pt_br, zh_cn…) to the VEX file name. */
    static String fileFor(String mcCode) {
        if (mcCode == null) return null;
        String c = mcCode.toLowerCase();
        if (c.equals("zh_cn")) return "zh";
        if (c.startsWith("zh_")) return null; // traditional Chinese: not translated yet
        int u = c.indexOf('_');
        return u > 0 ? c.substring(0, u) : c;
    }

    private static Map<String, String> current() {
        String code;
        try { code = Minecraft.getInstance().getLanguageManager().getSelected(); } catch (Throwable t) { code = "en_us"; }
        if (code == null) code = "en_us";
        if (code.equals(loadedFor)) return dict;
        loadedFor = code;
        dict = load(fileFor(code));
        return dict;
    }

    private static Map<String, String> load(String file) {
        if (file == null || file.equals("en")) return Map.of();
        try (InputStream in = L.class.getResourceAsStream("/assets/vexclient/vexlang/" + file + ".json")) {
            if (in == null) return Map.of();
            JsonObject o = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
            Map<String, String> m = new HashMap<>();
            for (var e : o.entrySet()) if (e.getValue().isJsonPrimitive()) m.put(e.getKey(), e.getValue().getAsString());
            return m;
        } catch (Exception e) {
            return Map.of();
        }
    }

    public static String t(String english, Object... args) {
        if (english == null) return null;
        String s = current().getOrDefault(english, english);
        if (args.length == 0) return s;
        for (int i = 0; i < args.length && i < 10; i++) s = s.replace("{" + i + "}", String.valueOf(args[i]));
        return s;
    }
}
