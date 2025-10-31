"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";

// 🔽 usa nuestro tipo y utilidades
import type { UserDoc } from "@/types/user";
import { upsertUserDoc } from "@/data/users";

const FormSchema = z
  .object({
    email: z.string().email({ message: "Por favor, introduce un correo electrónico válido." }),
    password: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
    confirmPassword: z.string().min(6, { message: "La confirmación de contraseña debe tener al menos 6 caracteres." }),
    fullName: z.string().min(2, { message: "Ingresa tu nombre." }).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export function RegisterForm() {
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    const { email, password, fullName } = data;

    try {
      console.time("register-flow");

      // 1) Crear usuario Auth
      console.time("auth:createUser");
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      console.timeEnd("auth:createUser");

      // 2) Perfil opcional
      if (fullName && fullName.trim().length >= 2) {
        console.time("auth:updateProfile");
        await updateProfile(cred.user, { displayName: fullName.trim() });
        console.timeEnd("auth:updateProfile");
      }

      // 3) Firestore (⚠️ sin role explícito -> DEFAULT_ROLE = 'ARBITRO')
      console.time("firestore:upsertUserDoc");
      await upsertUserDoc({
        uid: cred.user.uid,
        email: cred.user.email!, // requerido por nuestro upsert
        displayName: cred.user.displayName ?? null,
        photoURL: cred.user.photoURL ?? null,
        // role: no lo mandes — cae en DEFAULT_ROLE
      });
      console.timeEnd("firestore:upsertUserDoc");

      toast.success("Cuenta creada con éxito.");
      console.timeEnd("register-flow");

      // 4) Redirect básico (afinaremos por rol cuando tengamos guards de rutas)
      router.replace("/dashboard/assignments");
    } catch (err: any) {
      console.error("Register error:", err);
      const code = err?.code ?? "unknown";
      switch (code) {
        case "auth/email-already-in-use":
          toast.error("Este correo ya está registrado.");
          break;
        case "auth/invalid-email":
          toast.error("Correo inválido.");
          break;
        case "auth/weak-password":
          toast.error("La contraseña es demasiado débil.");
          break;
        default:
          toast.error(`No se pudo crear la cuenta. (${code})`);
      }
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre completo (opcional)</FormLabel>
              <FormControl>
                <Input id="fullName" type="text" placeholder="Ej. Juan Pérez" autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                <Input id="password" type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar contraseña</FormLabel>
              <FormControl>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creando cuenta..." : "Registrarse"}
        </Button>
      </form>
    </Form>
  );
}
