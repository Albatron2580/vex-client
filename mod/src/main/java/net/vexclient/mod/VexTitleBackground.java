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
 * Menu background in the launcher's theme colours: a blocky Minecraft landscape (hazy mountain layers that
 * drift slowly, trees, moon, stars) with real leaf-shaped leaves tumbling down in front of it.
 * Colours come from config/vex-theme.json, written by the launcher from its active theme before each launch.
 */
public final class VexTitleBackground {
    private VexTitleBackground() {}

    // ---------- theme ----------
    private static int skyTop = 0xFF030817, skyMid = 0xFF0B2466, skyLow = 0xFF3D72DC;
    private static int far = 0xFF2C4FA4, near = 0xFF071431, fog = 0xFF3A6AD0;
    private static int grassFar = 0xFF5584E6, grassNear = 0xFF2A62E0;
    private static int moon = 0xFFE4ECFF, glow = 0xFF5B8CFF, trunk = 0xFF0A1230, snow = 0;
    private static int[] treeLeaves = {0xFF12398C, 0xFF1B4DB3, 0xFF0E2F73};
    private static int[] leafColors = {0xFF2F7DFF, 0xFF5B9BFF, 0xFF1D4FB5, 0xFF8FB8FF};
    private static boolean pine;
    private static boolean loaded;

    private static int hex(String s) {
        String h = s.startsWith("#") ? s.substring(1) : s;
        return 0xFF000000 | (Integer.parseInt(h, 16) & 0xFFFFFF);
    }

    private static int[] hexArray(JsonArray a, int[] def) {
        if (a == null || a.isEmpty()) return def;
        int[] out = new int[a.size()];
        for (int i = 0; i < out.length; i++) out[i] = hex(a.get(i).getAsString());
        return out;
    }

    private static void loadTheme() {
        loaded = true;
        try {
            Path f = FabricLoader.getInstance().getConfigDir().resolve("vex-theme.json");
            if (!Files.exists(f)) return;
            JsonObject j = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
            leafColors = hexArray(j.getAsJsonArray("leaves"), leafColors);
            JsonObject l = j.getAsJsonObject("land");
            if (l == null) return;
            JsonArray sky = l.getAsJsonArray("sky");
            skyTop = hex(sky.get(0).getAsString());
            skyMid = hex(sky.get(1).getAsString());
            skyLow = hex(sky.get(2).getAsString());
            far = hex(l.get("far").getAsString());
            near = hex(l.get("near").getAsString());
            fog = hex(l.get("fog").getAsString());
            JsonArray grass = l.getAsJsonArray("grass");
            grassFar = hex(grass.get(0).getAsString());
            grassNear = hex(grass.get(1).getAsString());
            if (l.has("snow")) snow = hex(l.get("snow").getAsString());
            if (l.has("moon")) moon = hex(l.get("moon").getAsString());
            if (l.has("glow")) glow = hex(l.get("glow").getAsString());
            JsonObject t = l.getAsJsonObject("trees");
            if (t != null) {
                trunk = hex(t.get("trunk").getAsString());
                treeLeaves = hexArray(t.getAsJsonArray("leaves"), treeLeaves);
                pine = "pine".equals(t.get("type").getAsString());
            }
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not read vex-theme.json, using Vex blue", e);
        }
    }

    // ---------- colour helpers ----------
    private static int mix(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return 0xFF000000 | ((int) (ar + (br - ar) * t) << 16) | ((int) (ag + (bg - ag) * t) << 8) | (int) (ab + (bb - ab) * t);
    }

    private static int shade(int c, float k) {
        return k > 0 ? mix(c, 0xFFFFFFFF, k) : mix(c, 0xFF000000, -k);
    }

    private static int alpha(int c, int a) {
        return (a << 24) | (c & 0xFFFFFF);
    }

    // ---------- landscape ----------
    private static final float[][] LAYERS = {
        // base (fraction of height), amplitude, block size (gui px), drift speed (px/s), tree chance
        {0.50f, 0.17f, 4, 1.5f, 0f},
        {0.60f, 0.11f, 5, 3f, 0.05f},
        {0.70f, 0.08f, 7, 5f, 0.10f},
        {0.82f, 0.06f, 9, 8f, 0.14f},
    };
    private static final long START = System.nanoTime();

    private static float height(int layer, float x) {
        double p = layer * 1.7;
        return (float) (Math.sin(x * 0.011 + p) * 0.55 + Math.sin(x * 0.027 + p * 2.3) * 0.3 + Math.sin(x * 0.061 + p * 3.1) * 0.15);
    }

    private static float hash(int a, int b) {
        int h = a * 374761393 + b * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) & 0xFFFF) / 65535f;
    }

    private static void renderLandscape(GuiGraphics g, int w, int h, float t) {
        // sky
        g.fillGradient(0, 0, w, h * 55 / 100, skyTop, skyMid);
        g.fillGradient(0, h * 55 / 100, w, h, skyMid, skyLow);
        // stars (twinkling)
        for (int i = 0; i < 70; i++) {
            int sx = (int) (hash(i, 1) * w), sy = (int) (hash(i, 2) * h * 0.5f);
            float tw = 0.5f + 0.5f * (float) Math.sin(t * (0.8 + hash(i, 3) * 2) + i);
            g.fill(sx, sy, sx + 1, sy + 1, alpha(0xFFFFFF, (int) (60 + 150 * tw * (1 - sy / (h * 0.55f)))));
        }
        // moon with a soft glow
        int ms = Math.max(10, h / 14), mx = (int) (w * 0.78f), my = (int) (h * 0.16f);
        for (int r = 14; r >= 1; r--) {          // soft glow: many faint rings
            int gr = ms / 2 + r * ms / 6;
            g.fill(mx - gr, my - gr, mx + gr, my + gr, alpha(glow, 5 + (14 - r)));
        }
        g.fill(mx - ms / 2, my - ms / 2, mx + ms / 2, my + ms / 2, moon);
        int q = Math.max(1, ms / 8);
        g.fill(mx - ms / 2 + q, my - ms / 2 + 2 * q, mx - ms / 2 + 3 * q, my - ms / 2 + 4 * q, shade(moon, -0.12f));
        g.fill(mx + q, my + q, mx + 3 * q, my + 2 * q, shade(moon, -0.12f));

        // mountain layers, far to near, each drifting a little faster (parallax)
        for (int li = 0; li < LAYERS.length; li++) {
            float[] L = LAYERS[li];
            float depth = li / (float) (LAYERS.length - 1);
            float haze = (1 - depth) * 0.6f;
            int body = mix(mix(far, near, depth), fog, haze * 0.7f);
            int top = mix(mix(grassFar, grassNear, depth), fog, haze * 0.35f);
            if (snow != 0 && li < 3) top = mix(snow, fog, haze * 0.3f);
            int blk = (int) L[2];
            float off = t * L[3];
            int first = (int) Math.floor(off / blk) - 1;
            int cols = w / blk + 3;
            int prevY = Integer.MIN_VALUE;
            for (int c = 0; c < cols; c++) {
                int col = first + c;
                float worldX = col * blk;
                int x = (int) (worldX - off);
                int y = Math.round((h * L[0] - height(li, worldX) * h * L[1]) / blk) * blk;
                g.fillGradient(x, y, x + blk, h, body, shade(body, -0.35f));
                g.fill(x, y, x + blk, y + Math.max(1, blk / 3), top);
                if (prevY != Integer.MIN_VALUE && prevY > y) g.fill(x, y, x + 1, prevY, alpha(0xFFFFFF, 18)); // lit edge
                prevY = y;
                if (L[4] > 0 && hash(col, li * 31) < L[4] && hash(col - 1, li * 31) >= L[4]) drawTree(g, x, y, blk, haze, col);
            }
            // haze between layers
            g.fillGradient(0, (int) (h * (L[0] - L[1] * 0.3f)), w, h, alpha(fog, 0), alpha(fog, (int) (70 * (1 - depth * 0.7f))));
        }
        // gentle darkening at the bottom so the buttons stand out
        g.fillGradient(0, h / 2, w, h, 0x00000000, 0x66000000);
    }

    private static void drawTree(GuiGraphics g, int x, int ground, int blk, float haze, int seed) {
        int b = Math.max(2, blk * 2 / 3);
        int trunkH = 3 + (int) (hash(seed, 7) * 2);
        g.fill(x + b, ground - b * trunkH, x + 2 * b, ground, mix(trunk, fog, haze * 0.6f));
        int top = ground - b * trunkH;
        if (pine) {
            int[] widths = {5, 3, 3, 1};
            int y = ground - b * (trunkH - 1);
            for (int i = 0; i < widths.length; i++) {
                y -= b;
                int wd = widths[i];
                int c = mix(treeLeaves[(seed + i) % treeLeaves.length], fog, haze * 0.6f);
                g.fill(x + b - (wd / 2) * b, y, x + b - (wd / 2) * b + wd * b, y + b, c);
                if (snow != 0) g.fill(x + b - (wd / 2) * b, y, x + b - (wd / 2) * b + wd * b, y + Math.max(1, b / 3), mix(snow, fog, haze * 0.3f));
            }
        } else {
            int[][] rows = {{5, 1}, {5, 0}, {3, -1}};
            for (int[] r : rows) {
                for (int k = 0; k < r[0]; k++) {
                    int c = mix(treeLeaves[(seed + k + r[1] + 3) % treeLeaves.length], fog, haze * 0.6f);
                    int px = x + b + (k - r[0] / 2) * b;
                    g.fill(px, top + r[1] * b - b, px + b, top + r[1] * b, c);
                }
            }
        }
    }

    // ---------- falling leaves ----------
    // A real leaf: pointed tip, wide body, centre vein, darker right half, little stem.
    // O = leaf, L = light vein, S = shadow side, D = stem / dark edge
    private static final String[] LEAF = {
        "......O.......",
        ".....OOO......",
        "....OOLOS.....",
        "...OOOLOSS....",
        "..OOOOLOSSS...",
        "..OOOOLOSSS...",
        ".OOOOOLOSSSS..",
        ".OOOOOLOSSSS..",
        "..OOOOLOSSS...",
        "..OOOOLOSSS...",
        "...OOOLOSS....",
        "....OOLOS.....",
        "......D.......",
        ".....D........",
    };
    private static final int N = 14;
    private static final int ANGLES = 16;
    private static char[][][] rotated; // [angle][y][x]

    private static void buildRotations() {
        rotated = new char[ANGLES][N][N];
        double c0 = (N - 1) / 2.0;
        for (int a = 0; a < ANGLES; a++) {
            double ang = a * Math.PI * 2 / ANGLES;
            double cos = Math.cos(ang), sin = Math.sin(ang);
            for (int y = 0; y < N; y++) {
                for (int x = 0; x < N; x++) {
                    // nearest-neighbour inverse rotation keeps the pixel-art look
                    double dx = x - c0, dy = y - c0;
                    int sx = (int) Math.round(dx * cos + dy * sin + c0);
                    int sy = (int) Math.round(-dx * sin + dy * cos + c0);
                    rotated[a][y][x] = sx >= 0 && sy >= 0 && sx < N && sy < N ? LEAF[sy].charAt(sx) : '.';
                }
            }
        }
    }

    private static final class Leaf {
        float x, y, vy, drift, phase, sway, angle, spin;
        int size, color, shadesFor;
        int[] shades;
    }

    private static final List<Leaf> leaves = new ArrayList<>();
    private static final Random RND = new Random();
    private static long last;
    private static int lastW, lastH;

    private static Leaf spawn(int w, int h, boolean anywhere) {
        Leaf l = new Leaf();
        l.size = 1 + RND.nextInt(2);                 // 1..2 gui px per leaf pixel
        l.x = RND.nextFloat() * w;
        l.y = anywhere ? RND.nextFloat() * h : -N * l.size - RND.nextFloat() * 40;
        l.vy = 10 + RND.nextFloat() * 18;
        l.drift = -6 + RND.nextFloat() * 12;
        l.phase = RND.nextFloat() * 6.28f;
        l.sway = 0.6f + RND.nextFloat() * 0.9f;
        l.angle = RND.nextFloat() * ANGLES;
        l.spin = (RND.nextBoolean() ? 1 : -1) * (1.5f + RND.nextFloat() * 3f);
        l.color = leafColors[RND.nextInt(leafColors.length)];
        return l;
    }

    // Each rotated sprite as horizontal runs of one colour: {y, x0, x1, kind}. A leaf is ~20 quads instead of ~100.
    private static int[][][] runs;

    private static void buildRuns() {
        runs = new int[ANGLES][][];
        for (int a = 0; a < ANGLES; a++) {
            List<int[]> out = new ArrayList<>();
            for (int y = 0; y < N; y++) {
                char[] row = rotated[a][y];
                int x = 0;
                while (x < N) {
                    char ch = row[x];
                    if (ch == '.') { x++; continue; }
                    int x1 = x + 1;
                    while (x1 < N && row[x1] == ch) x1++;
                    out.add(new int[]{y, x, x1, ch == 'L' ? 1 : ch == 'S' ? 2 : ch == 'D' ? 3 : 0});
                    x = x1;
                }
            }
            runs[a] = out.toArray(new int[0][]);
        }
    }

    private static void drawLeaf(GuiGraphics g, Leaf l) {
        if (runs == null) buildRuns();
        int[][] sprite = runs[((int) Math.floor(l.angle) % ANGLES + ANGLES) % ANGLES];
        int s = l.size;
        int x0 = Math.round(l.x), y0 = Math.round(l.y);
        if (l.shades == null || l.shadesFor != l.color) {
            l.shades = new int[]{l.color, shade(l.color, 0.4f), shade(l.color, -0.28f), shade(l.color, -0.5f)};
            l.shadesFor = l.color;
        }
        for (int[] r : sprite) g.fill(x0 + r[1] * s, y0 + r[0] * s, x0 + r[2] * s, y0 + r[0] * s + s, l.shades[r[3]]);
    }

    public static void render(GuiGraphics g, int w, int h) {
        if (!loaded) loadTheme();
        if (rotated == null) buildRotations();
        float t = (System.nanoTime() - START) / 1e9f;
        renderLandscape(g, w, h, t);

        if (!VexConfig.get().menuLeaves) return;
        if (w != lastW || h != lastH || leaves.isEmpty()) {
            leaves.clear();
            int count = Math.max(14, Math.min(45, w * h / 7000));
            for (int i = 0; i < count; i++) leaves.add(spawn(w, h, true));
            lastW = w;
            lastH = h;
        }
        long now = System.nanoTime();
        float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
        last = now;
        for (int i = 0; i < leaves.size(); i++) {
            Leaf l = leaves.get(i);
            l.phase += dt * l.sway;
            l.y += l.vy * dt;
            l.x += (l.drift + (float) Math.sin(l.phase) * 12) * dt;
            l.angle += l.spin * dt;
            if (l.y > h + 10 || l.x < -40 || l.x > w + 40) {
                leaves.set(i, spawn(w, h, false));
                continue;
            }
            drawLeaf(g, l);
        }
    }
}
