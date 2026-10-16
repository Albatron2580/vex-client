package net.vexclient.mod;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.GuiGraphics;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Menu background: only the Vex theme colours with falling pixel leaves, nothing else.
 * The colours come from config/vex-theme.json, which the launcher writes from its active theme.
 */
public final class VexTitleBackground {
    private VexTitleBackground() {}

    // 8x8 Minecraft-style leaf: O = leaf colour, L = lighter, D = darker vein
    private static final String[] LEAF = {
        "......OO",
        "....OOLO",
        "...OLOO.",
        "..OODO..",
        ".OODOO..",
        ".ODOO...",
        "ODO.....",
        "D.......",
    };

    private static int top = 0xFF030817, bottom = 0xFF183C9A, glow = 0x402F7DFF;
    private static int[] colors = {0xFF2F7DFF, 0xFF5B9BFF, 0xFF1D4FB5, 0xFF8FB8FF};
    private static boolean loaded;

    private static final class Leaf {
        float x, y, vy, drift, phase, sway;
        int size, color;
        boolean mirror;
    }

    private static final List<Leaf> leaves = new ArrayList<>();
    private static final Random RND = new Random();
    private static long last;
    private static int lastW, lastH;

    private static int parse(String hex, int alpha) {
        String h = hex.startsWith("#") ? hex.substring(1) : hex;
        return (alpha << 24) | (Integer.parseInt(h, 16) & 0xFFFFFF);
    }

    private static void loadTheme() {
        loaded = true;
        try {
            Path f = FabricLoader.getInstance().getConfigDir().resolve("vex-theme.json");
            if (!Files.exists(f)) return;
            JsonObject j = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
            top = parse(j.get("top").getAsString(), 0xFF);
            bottom = parse(j.get("bottom").getAsString(), 0xFF);
            glow = parse(j.get("accent").getAsString(), 0x40);
            JsonArray a = j.getAsJsonArray("leaves");
            int[] c = new int[a.size()];
            for (int i = 0; i < c.length; i++) c[i] = parse(a.get(i).getAsString(), 0xFF);
            if (c.length > 0) colors = c;
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not read vex-theme.json", e);
        }
    }

    private static Leaf spawn(int w, int h, boolean anywhere) {
        Leaf l = new Leaf();
        l.size = 2 + RND.nextInt(3);                 // 2..4 screen pixels per leaf pixel
        l.x = RND.nextFloat() * w;
        l.y = anywhere ? RND.nextFloat() * h : -8 * l.size - RND.nextFloat() * 40;
        l.vy = 12 + RND.nextFloat() * 22;
        l.drift = -6 + RND.nextFloat() * 12;
        l.phase = RND.nextFloat() * 6.28f;
        l.sway = 0.6f + RND.nextFloat() * 0.9f;
        l.color = colors[RND.nextInt(colors.length)];
        l.mirror = RND.nextBoolean();
        return l;
    }

    private static int shade(int argb, float k) {
        int a = argb >>> 24, r = (argb >> 16) & 255, g = (argb >> 8) & 255, b = argb & 255;
        if (k > 0) { r += (int) ((255 - r) * k); g += (int) ((255 - g) * k); b += (int) ((255 - b) * k); }
        else { r = (int) (r * (1 + k)); g = (int) (g * (1 + k)); b = (int) (b * (1 + k)); }
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    public static void render(GuiGraphics g, int w, int h) {
        if (!loaded) loadTheme();
        g.fillGradient(0, 0, w, h, top, bottom);
        g.fillGradient(0, 0, w, h / 3, glow, 0x00000000);

        if (w != lastW || h != lastH || leaves.isEmpty()) {
            leaves.clear();
            int count = Math.max(18, Math.min(60, w * h / 9000));
            for (int i = 0; i < count; i++) leaves.add(spawn(w, h, true));
            lastW = w; lastH = h;
        }
        long now = System.nanoTime();
        float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
        last = now;
        for (int i = 0; i < leaves.size(); i++) {
            Leaf l = leaves.get(i);
            l.phase += dt * l.sway;
            l.y += l.vy * dt;
            l.x += (l.drift + (float) Math.sin(l.phase) * 14) * dt;
            if (l.y > h + 10 || l.x < -40 || l.x > w + 40) { leaves.set(i, spawn(w, h, false)); continue; }
            drawLeaf(g, l);
        }
    }

    private static void drawLeaf(GuiGraphics g, Leaf l) {
        int s = l.size;
        int x0 = Math.round(l.x), y0 = Math.round(l.y);
        // flip direction every so often, like a leaf turning over
        boolean mirror = l.mirror ^ (Math.sin(l.phase * 1.7) > 0);
        for (int r = 0; r < 8; r++) {
            String row = LEAF[r];
            for (int c = 0; c < 8; c++) {
                char ch = row.charAt(mirror ? 7 - c : c);
                if (ch == '.') continue;
                int col = ch == 'L' ? shade(l.color, 0.35f) : ch == 'D' ? shade(l.color, -0.35f) : l.color;
                int px = x0 + c * s, py = y0 + r * s;
                g.fill(px, py, px + s, py + s, col);
            }
        }
    }
}
