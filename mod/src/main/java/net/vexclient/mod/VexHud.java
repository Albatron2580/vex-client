package net.vexclient.mod;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import java.util.ArrayList;
import java.util.List;

/** Small HUD in the top-left corner: FPS, coordinates and facing. Drawn by the Gui mixin. */
public final class VexHud {
    private VexHud() {}

    public static void render(GuiGraphics g) {
        Minecraft mc = Minecraft.getInstance();
        VexConfig c = VexConfig.get();
        if (mc.player == null || mc.options.hideGui) return;
        List<String> lines = new ArrayList<>();
        if (c.showFps) lines.add("FPS " + mc.getFps());
        if (c.showCoords) lines.add(String.format("XYZ %.1f / %.1f / %.1f", mc.player.getX(), mc.player.getY(), mc.player.getZ()));
        if (c.showDirection) lines.add("Facing " + mc.player.getDirection().getName());
        if (lines.isEmpty()) return;
        int w = 0;
        for (String l : lines) w = Math.max(w, mc.font.width(l));
        int x = 4;
        int y = 4;
        int h = lines.size() * 11 + 4;
        if (c.hudBackground) {
            g.fill(x - 2, y - 2, x + w + 6, y + h - 2, 0x900A1430);
            g.fill(x - 2, y - 2, x, y + h - 2, 0xFF2F7DFF);
        }
        for (int i = 0; i < lines.size(); i++) {
            g.drawString(mc.font, lines.get(i), x + 3, y + i * 11, i == 0 && c.showFps ? 0xFF8FB8FF : 0xFFFFFFFF, true);
        }
    }
}
