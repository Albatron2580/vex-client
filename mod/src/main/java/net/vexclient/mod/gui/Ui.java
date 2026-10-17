package net.vexclient.mod.gui;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

/** Shared Vex look: dark purple panels with orange accents. */
public final class Ui {
    private Ui() {}
    public static final int PANEL = 0xEE1A0F2E;
    public static final int PANEL_2 = 0xCC261642;
    public static final int EDGE = 0xFF3A2463;
    public static final int ORANGE = 0xFFFF8A1F;
    public static final int PURPLE = 0xFFB46CFF;
    public static final int TEXT = 0xFFF3EEFF;
    public static final int DIM = 0xFFA898C8;
    public static final int GOOD = 0xFF5BFF7A;
    public static final int WARN = 0xFFFFC14F;
    public static final int BAD = 0xFFFF5B6E;

    /** A panel with a 1px border, a soft inner edge and an orange strip on top. */
    public static void panel(GuiGraphics g, int x0, int y0, int x1, int y1, boolean accent) {
        g.fill(x0 - 1, y0 - 1, x1 + 1, y1 + 1, EDGE);
        g.fill(x0, y0, x1, y1, PANEL);
        g.fill(x0, y1 - 1, x1, y1, 0x55000000);
        if (accent) g.fill(x0, y0, x1, y0 + 2, ORANGE);
    }

    public static void box(GuiGraphics g, int x0, int y0, int x1, int y1) {
        g.fill(x0, y0, x1, y1, PANEL_2);
        g.fill(x0, y0, x1, y0 + 1, 0x33FFFFFF);
    }

    /** "VEX CLIENT" in pixel-y big letters: VEX in orange, CLIENT in white. */
    public static void title(GuiGraphics g, Font font, int cx, int y, float scale) {
        String a = "VEX ", b = "CLIENT";
        int w = font.width(a + b);
        var pose = g.pose();
        pose.pushMatrix();
        pose.translate(cx - w * scale / 2f, y);
        pose.scale(scale, scale);
        g.drawString(font, a, 1, 1, 0xFF5A2A00, false);
        g.drawString(font, a, 0, 0, ORANGE, false);
        g.drawString(font, b, font.width(a) + 1, 1, 0xFF2A1450, false);
        g.drawString(font, b, font.width(a), 0, TEXT, false);
        pose.popMatrix();
    }
}
