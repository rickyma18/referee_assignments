"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getUserDoc } from "@/data/users";
import { auth } from "@/lib/firebase";
import { createSessionAction } from "@/server/auth/auth.actions";

const FormSchema = z.object({
  email: z.string().email({ message: "Por favor ingrese un correo electrónico válido." }),
  password: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
  remember: z.boolean().optional(),
});

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    const { email, password, remember } = data;
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      const idToken = await cred.user.getIdToken(true);
      await createSessionAction(idToken);

      const u = await getUserDoc(uid);
      if (!u) {
        toast.error("Tu cuenta no está configurada. Contacta al administrador.");
        return;
      }

      if ((u as any).active === false) {
        toast.error("Usuario inactivo. Contacta al administrador.");
        return;
      }

      switch (u.role) {
        case "SUPERUSUARIO":
          router.replace("/dashboard/default");
          break;
        case "DELEGADO":
        case "ASISTENTE":
        case "ARBITRO":
          router.replace("/dashboard/assignments");
          break;
        default:
          toast.error("No tienes permisos para acceder.");
      }
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        toast.error("Correo o contraseña incorrectos.");
      } else if (code === "auth/too-many-requests") {
        toast.error("Demasiados intentos. Inténtalo más tarde.");
      } else {
        toast.error(err?.message ?? "No se pudo iniciar sesión.");
      }
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                    {...field}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center">
              <FormControl>
                <Checkbox
                  id="login-remember"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                  className="size-4"
                />
              </FormControl>
              <FormLabel htmlFor="login-remember" className="text-muted-foreground ml-1 text-sm font-medium">
                Recordar dispositivo
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
        </Button>
      </form>
    </Form>
  );
}
