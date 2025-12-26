"use client";

import { FormEvent, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle, AlertCircle } from "lucide-react";

export default function ContactPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email || !email.includes("@")) {
      setError("Email invalide");
      return;
    }
    if (!subject || subject.trim().length < 3) {
      setError("Objet invalide");
      return;
    }
    if (!message || message.trim().length < 10) {
      setError("Votre message est trop court");
      return;
    }

    setLoading(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const contactSupport = httpsCallable(functions, "contactSupport");
      await contactSupport({
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setSuccess(true);
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
        <p className="text-muted-foreground">
          Envoyez une demande au support. Réponse sous 24–72h ouvrées.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Formulaire</CardTitle>
          <CardDescription>
            Renseignez votre email, l'objet et votre message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p>{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-500">
                <CheckCircle className="h-4 w-4" />
                <p>Message envoyé. Merci !</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Votre email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="votre@email.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Objet</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ex: Problème de connexion / Facturation / Challenge..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={8}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Décrivez votre demande avec un maximum de détails..."
              />
            </div>

            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Envoyer
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
