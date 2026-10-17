package net.vexclient.mod.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import net.minecraft.client.renderer.GameRenderer;
import net.vexclient.mod.module.Modules;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @ModifyReturnValue(method = "getFov", at = @At("RETURN"))
    private float vexclient$zoom(float fov) {
        return Modules.zoom == null ? fov : fov * Modules.zoom.multiplier();
    }
}
