package net.vexclient.mod.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.vexclient.mod.VexTitleBackground;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Replaces the rotating world panorama of the menus with the Vex colours and falling leaves. */
@Mixin(Screen.class)
public abstract class ScreenMixin {
    @Inject(method = "renderPanorama", at = @At("HEAD"), cancellable = true)
    private void vexclient$background(GuiGraphics graphics, float partialTick, CallbackInfo ci) {
        Screen self = (Screen) (Object) this;
        VexTitleBackground.render(graphics, self.width, self.height);
        ci.cancel();
    }
}
