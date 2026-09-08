"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createContactAction, updateContactAction } from "@/app/actions/crm";
import { Button, Field, inputClass, selectClass, textareaClass } from "@/components/ui/primitives";
import type { Contact, Profile } from "@/lib/types";
import { contactSchema } from "@/lib/validation";

type Values = z.infer<typeof contactSchema>;

type ContactFormProps = {
  profiles: Profile[];
  currentUserId: string;
  contact?: Contact;
};

export function ContactForm({ profiles, currentUserId, contact }: ContactFormProps) {
  const router = useRouter();
  const isEditing = Boolean(contact);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      full_name: contact?.full_name ?? "",
      phone: contact?.phone ?? "",
      whatsapp_number: contact?.whatsapp_number ?? "",
      email: contact?.email ?? "",
      location_text: contact?.location_text ?? "",
      organization_name: contact?.organization_name ?? "",
      notes: contact?.notes ?? "",
      owner_id: contact?.owner_id ?? currentUserId,
    },
  });

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = contact
          ? await updateContactAction(contact.id, values)
          : await createContactAction(values);

        if (!result.ok) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.push(`/contacts/${result.slug ?? result.id}`);
        router.refresh();
      })}
      className="space-y-6"
    >
      <div className="rounded-lg border border-[#dce7dd] bg-[#f3f8f3] px-4 py-3 text-[11px] leading-5 text-[#537158]">
        Phone numbers are normalized when saved. The CRM checks this key before creating future WhatsApp leads, so one person can keep one record across many requests.
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name?.message}>
          <input {...register("full_name")} className={inputClass} placeholder="Customer’s full name" />
        </Field>
        <Field label="Owner" error={errors.owner_id?.message}>
          <select {...register("owner_id")} className={selectClass}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
          </select>
        </Field>
        <Field label="Phone number" error={errors.phone?.message}>
          <input {...register("phone")} className={inputClass} placeholder="+961" inputMode="tel" />
        </Field>
        <Field label="WhatsApp number">
          <input {...register("whatsapp_number")} className={inputClass} placeholder="Same as phone if applicable" inputMode="tel" />
        </Field>
        <Field label="Email (optional)" error={errors.email?.message}>
          <input {...register("email")} type="email" className={inputClass} />
        </Field>
        <Field label="Location (optional)">
          <input {...register("location_text")} className={inputClass} />
        </Field>
        <Field label="Organization / business (optional)">
          <input {...register("organization_name")} className={inputClass} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea {...register("notes")} className={textareaClass} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-[#edf0ed] pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {isEditing ? "Save changes" : "Create contact"}
        </Button>
      </div>
    </form>
  );
}
