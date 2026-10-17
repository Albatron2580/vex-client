package net.vexclient.mod.module.impl;

import net.minecraft.client.Minecraft;
import net.vexclient.mod.module.Module;

/** Keeps sprint held so you never have to double-tap or hold Ctrl. */
public final class SprintModule extends Module {
    public SprintModule() { super("sprint", "Always Sprint", "Sprint automatically whenever you walk forward.", Category.GENERAL, false); }

    @Override public void tick(Minecraft mc) {
        if (mc.player != null && mc.screen == null) mc.options.keySprint.setDown(true);
    }

    @Override protected void onDisable() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.options != null) mc.options.keySprint.setDown(false);
    }
}
