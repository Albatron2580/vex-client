package net.vexclient.mod.module.impl;

import net.minecraft.client.Minecraft;
import net.vexclient.mod.module.Module;
import net.vexclient.mod.module.Modules;
import net.vexclient.mod.module.Setting;
import org.lwjgl.glfw.GLFW;

/** Hold the zoom key (C by default) to zoom in. */
public final class ZoomModule extends Module {
    public final Setting.Num level = add(new Setting.Num("level", "Strength", 4, 2, 10, 1, "x"));
    public final Setting.Bool smooth = add(new Setting.Bool("smooth", "Smooth", true));
    private float factor = 1f;

    public ZoomModule() {
        super("zoom", "Zoom", "Hold the key to zoom in (like OptiFine zoom).", Category.MISC, false);
        key = GLFW.GLFW_KEY_C;
        enabledByDefault();
    }

    /** FOV multiplier for this frame (1 = no zoom). */
    public float multiplier() {
        Minecraft mc = Minecraft.getInstance();
        boolean held = isEnabled() && mc.screen == null && Modules.keyDown(key);
        float target = held ? (float) (1.0 / level.get()) : 1f;
        if (smooth.get()) factor += (target - factor) * 0.25f; else factor = target;
        if (Math.abs(factor - target) < 0.001f) factor = target;
        return factor;
    }
}
