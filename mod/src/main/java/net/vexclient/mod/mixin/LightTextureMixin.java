package net.vexclient.mod.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import net.minecraft.client.Minecraft;
import net.minecraft.client.OptionInstance;
import net.minecraft.client.renderer.LightTexture;
import net.vexclient.mod.module.Modules;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Fullbright: while the light map is built, the brightness (gamma) option reads as very high. */
@Mixin(LightTexture.class)
public abstract class LightTextureMixin {
    @WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/OptionInstance;get()Ljava/lang/Object;"))
    private Object vexclient$fullbright(OptionInstance<?> option, Operation<Object> original) {
        Object v = original.call(option);
        if (Modules.fullbright != null && Modules.fullbright.isActive() && option == Minecraft.getInstance().options.gamma()) return 15.0D;
        return v;
    }
}
