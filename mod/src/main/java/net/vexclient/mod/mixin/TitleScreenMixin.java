package net.vexclient.mod.mixin;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.vexclient.mod.VexClientMod;
import net.vexclient.mod.gui.Ui;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(TitleScreen.class)
public abstract class TitleScreenMixin extends Screen {
    protected TitleScreenMixin(Component title) { super(title); }

    @Inject(method = "init", at = @At("TAIL"))
    private void vexclient$button(CallbackInfo ci) {
        VexClientMod.addSettingsButton(this, this.children(), this::addRenderableWidget, true);
    }

    /** VEX CLIENT in the top-left corner, so you can see the client is running. */
    @Inject(method = "render", at = @At("TAIL"))
    private void vexclient$brand(GuiGraphics g, int mouseX, int mouseY, float pt, CallbackInfo ci) {
        Ui.title(g, this.font, 6, 6, 1.25f);
        String v = "v" + FabricLoader.getInstance().getModContainer("vexclient").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("") + " · Right Shift = menu";
        g.drawString(this.font, v, 6, 19, 0xB0FFFFFF, true);
    }
}
