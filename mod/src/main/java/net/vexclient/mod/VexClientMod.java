package net.vexclient.mod;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** VEX CLIENT: the Right Shift menu, movable HUD, legit addons (zoom, sprint, fullbright, combat HUD), the grey V badge. No hacks. */
public final class VexClientMod implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("vexclient");

    public static KeyMapping openSettings;

    @Override
    public void onInitializeClient() {
        VexConfig.load();
        net.vexclient.mod.module.Modules.init();
        net.vexclient.mod.hud.CombatStats.init();
        net.vexclient.mod.online.VexOnline.start();

        openSettings = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.vexclient.settings", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, KeyMapping.Category.MISC));

        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            while (openSettings.consumeClick()) {
                if (mc.screen == null) mc.setScreen(new net.vexclient.mod.gui.VexRadialScreen(null));
            }
            net.vexclient.mod.module.Modules.tick(mc);
            net.vexclient.mod.hud.Hud.tick(mc);
        });

        LOG.info("Vex Client mod loaded");
    }

    /**
     * Adds the "Vex Client" button to a menu.
     * Title screen: right under Minecraft Realms, using the gap above the Options row (that row moves down
     * only as far as needed). Pause menu: full width right under "Back to Game"; the grid moves down one row.
     */
    public static void addSettingsButton(net.minecraft.client.gui.screens.Screen screen, java.util.List<? extends net.minecraft.client.gui.components.events.GuiEventListener> children,
                                         java.util.function.Consumer<net.minecraft.client.gui.components.Button> add, boolean title) {
        java.util.List<net.minecraft.client.gui.components.AbstractWidget> buttons = new java.util.ArrayList<>();
        for (var c : children) if (c instanceof net.minecraft.client.gui.components.AbstractButton w && w.visible) buttons.add(w);
        if (buttons.isEmpty()) return;
        int x, width, y, shift;
        if (title) {
            // the Options / Quit row is the lowest row of 20px-high buttons; the row above it is Realms
            int rowY = Integer.MIN_VALUE;
            for (var w : buttons) if (w.getY() > rowY && w.getHeight() == 20) rowY = w.getY();
            net.minecraft.client.gui.components.AbstractWidget above = null;
            for (var w : buttons) if (w.getY() < rowY && w.getWidth() >= 150 && (above == null || w.getY() > above.getY())) above = w;
            if (above == null) return;
            x = above.getX();
            width = above.getWidth();
            y = above.getY() + 24;
            shift = Math.max(0, y + 24 - rowY);
        } else {
            net.minecraft.client.gui.components.AbstractWidget first = null; // "Back to Game"
            for (var w : buttons) if (w.getWidth() >= 150 && (first == null || w.getY() < first.getY())) first = w;
            if (first == null) return;
            x = first.getX();
            width = first.getWidth();
            y = first.getY() + first.getHeight() + 4;
            shift = 24;
        }
        final int insertY = y;
        if (shift > 0) for (var c : children) if (c instanceof net.minecraft.client.gui.components.AbstractWidget w && w.getY() >= insertY) w.setY(w.getY() + shift);
        var mc = Minecraft.getInstance();
        add.accept(net.minecraft.client.gui.components.Button.builder(
                net.minecraft.network.chat.Component.literal("VEX CLIENT"),
                b -> mc.setScreen(new net.vexclient.mod.gui.VexRadialScreen(screen))).bounds(x, insertY, width, 20).build());
    }
}
