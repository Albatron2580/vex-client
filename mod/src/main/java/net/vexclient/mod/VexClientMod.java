package net.vexclient.mod;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Vex Client: in-game settings menu, HUD (FPS, coordinates), zoom and always-sprint. */
public final class VexClientMod implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("vexclient");

    public static KeyMapping openSettings;
    public static KeyMapping zoomKey;

    /** 1.0 = no zoom; eases towards the target each frame when smooth zoom is on. */
    public static float zoomFactor = 1.0f;

    @Override
    public void onInitializeClient() {
        VexConfig.load();

        openSettings = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, KeyMapping.Category.MISC));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.zoom", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_C, KeyMapping.Category.MISC));

        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            while (openSettings.consumeClick()) {
                if (mc.screen == null) mc.setScreen(new VexSettingsScreen(null));
            }
            VexConfig c = VexConfig.get();
            if (c.alwaysSprint && mc.player != null && mc.screen == null) {
                mc.options.keySprint.setDown(true);
            }
        });

        // "Vex" buttons on the title screen and the pause menu.
        ScreenEvents.AFTER_INIT.register((mc, screen, width, height) -> {
            if (!VexConfig.get().vexTitleButtons) return;
            if (screen instanceof TitleScreen) {
                int y = height / 4 + 48 + 84;
                Button b = Button.builder(Component.literal("V"), btn -> mc.setScreen(new VexSettingsScreen(screen)))
                        .bounds(width / 2 - 148, y, 20, 20)
                        .tooltip(Tooltip.create(Component.literal("Vex Client settings")))
                        .build();
                Screens.getButtons(screen).add(b);
            } else if (screen instanceof PauseScreen) {
                Button b = Button.builder(Component.literal("Vex Client Settings"), btn -> mc.setScreen(new VexSettingsScreen(screen)))
                        .bounds(6, 6, 120, 20)
                        .build();
                Screens.getButtons(screen).add(b);
            }
        });

        LOG.info("Vex Client mod loaded");
    }

    /** Called every frame by the FOV mixin. */
    public static float zoomMultiplier() {
        VexConfig c = VexConfig.get();
        Minecraft mc = Minecraft.getInstance();
        boolean held = c.zoom && zoomKey != null && zoomKey.isDown() && mc.screen == null;
        float target = held ? 1.0f / c.zoomLevel : 1.0f;
        if (c.smoothZoom) zoomFactor += (target - zoomFactor) * 0.25f;
        else zoomFactor = target;
        if (Math.abs(zoomFactor - target) < 0.001f) zoomFactor = target;
        return zoomFactor;
    }
}
