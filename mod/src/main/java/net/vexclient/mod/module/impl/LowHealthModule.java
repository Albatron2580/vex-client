package net.vexclient.mod.module.impl;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.vexclient.mod.module.Module;
import net.vexclient.mod.module.Setting;

/** A red glow around the screen edges while your health is low. Only shows your own health. */
public final class LowHealthModule extends Module {
    public final Setting.Num hearts = add(new Setting.Num("hearts", "Warn below", 4, 1, 9, 1, " hearts"));
    public final Setting.Bool pulse = add(new Setting.Bool("pulse", "Pulse", true));

    public LowHealthModule() { super("lowhealth", "Low Health Warning", "A red glow around the screen when your health drops low.", Category.COMBAT, false); }

    public void render(GuiGraphics g, Minecraft mc) {
        if (!isEnabled() || mc.player == null || mc.player.isCreative() || mc.player.isSpectator()) return;
        float hp = mc.player.getHealth() / 2f;
        if (hp > hearts.get() || hp <= 0) return;
        float strength = 1f - (float) (hp / (hearts.get() + 0.5));
        if (pulse.get()) strength *= 0.65f + 0.35f * (float) Math.sin(System.currentTimeMillis() / 180.0);
        int a = Math.max(0, Math.min(200, Math.round(60 + strength * 140)));
        int w = g.guiWidth(), h = g.guiHeight(), d = Math.max(20, Math.min(w, h) / 6);
        int c = (a << 24) | 0xE0102A, z = 0x00E0102A;
        g.fillGradient(0, 0, w, d, c, z);
        g.fillGradient(0, h - d, w, h, z, c);
        for (int i = 0; i < d; i++) {
            int ai = Math.round(a * (1f - i / (float) d));
            g.fill(i, 0, i + 1, h, (ai << 24) | 0xE0102A);
            g.fill(w - i - 1, 0, w - i, h, (ai << 24) | 0xE0102A);
        }
    }
}
