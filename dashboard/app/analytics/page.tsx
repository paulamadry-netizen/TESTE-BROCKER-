'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Save } from "lucide-react";

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  closePrice: number;
  lots: number;
  pnl: number;
  openedAt: any;
  closedAt: any;
  note?: string;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const savedAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    loadTrades();
  }, [user]);

  const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const toDayKey = (v: any): string | null => {
    const d = toDate(v);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const loadTrades = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, 'trades'),
        where('userId', '==', user.uid),
        where('status', '==', 'closed'),
        orderBy('closedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Trade));

      setTrades(tradesData);
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!selectedTrade || !note.trim()) return;

    try {
      await updateDoc(doc(db, 'trades', selectedTrade.id), {
        note: note.trim()
      });

      await loadTrades();
      setSelectedTrade(null);
      setNote('');
      if (savedAnchorRef.current) {
        savedAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert('❌ Erreur sauvegarde note');
    }
  };

  const openNoteModal = (trade: Trade) => {
    setSelectedTrade(trade);
    setNote(trade.note || '');
  };

  const tradesByDay = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      const dayKey = toDayKey(t.closedAt || t.openedAt);
      if (!dayKey) continue;
      const list = map.get(dayKey) || [];
      list.push(t);
      map.set(dayKey, list);
    }
    // ensure deterministic ordering
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        const ad = toDate(a.closedAt || a.openedAt)?.getTime() || 0;
        const bd = toDate(b.closedAt || b.openedAt)?.getTime() || 0;
        return bd - ad;
      });
      map.set(k, list);
    }
    return map;
  }, [trades]);

  const selectedDayTrades = useMemo(() => {
    return tradesByDay.get(selectedDayKey) || [];
  }, [selectedDayKey, tradesByDay]);

  const savedAnalyses = useMemo(() => {
    return trades
      .filter(t => Boolean(t.note && t.note.trim()))
      .sort((a, b) => {
        const ad = toDate(a.closedAt || a.openedAt)?.getTime() || 0;
        const bd = toDate(b.closedAt || b.openedAt)?.getTime() || 0;
        return bd - ad;
      });
  }, [trades]);

  const monthLabel = useMemo(() => {
    return monthCursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }, [monthCursor]);

  const calendarCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const firstDay = first.getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday=0
    const start = new Date(year, month, 1 - offset);

    return Array.from({ length: 42 }).map((_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const inMonth = d.getMonth() === month;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = key === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
      const count = tradesByDay.get(key)?.length || 0;
      const pnl = (tradesByDay.get(key) || []).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
      return { date: d, key, inMonth, isToday, count, pnl };
    });
  }, [monthCursor, tradesByDay]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytique</h1>
            <p className="text-muted-foreground">Calendrier + journal de trading + analyses</p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-5 w-5" />
            <span className="text-sm">{monthLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Calendrier
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                <div>L</div>
                <div>M</div>
                <div>M</div>
                <div>J</div>
                <div>V</div>
                <div>S</div>
                <div>D</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((c) => {
                  const selected = c.key === selectedDayKey;
                  const pnlClass = c.pnl >= 0 ? 'text-green-500' : 'text-red-500';
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedDayKey(c.key)}
                      className={
                        "relative aspect-square rounded-md border transition text-sm " +
                        (c.inMonth ? "" : "opacity-40 ") +
                        (selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent/30")
                      }
                    >
                      <div className={"absolute left-2 top-2 text-xs " + (c.isToday ? "text-primary font-semibold" : "text-muted-foreground")}>{c.date.getDate()}</div>
                      {c.count > 0 && (
                        <div className="absolute right-2 top-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {c.count}
                        </div>
                      )}
                      {c.count > 0 && (
                        <div className={"absolute left-2 bottom-2 text-[10px] font-semibold " + pnlClass}>
                          {c.pnl >= 0 ? '+' : ''}{c.pnl.toFixed(0)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Sélectionne un jour pour afficher uniquement les trades de cette journée.
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Trades du jour
                </CardTitle>
                <div className="text-xs text-muted-foreground">{selectedDayKey}</div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedDayTrades.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">Aucun trade pour ce jour</div>
              ) : (
                <div className="space-y-3">
                  {selectedDayTrades.map((trade) => {
                    const side = (trade.side || '').toUpperCase();
                    const pnl = Number(trade.pnl) || 0;
                    const date = toDate(trade.closedAt || trade.openedAt);
                    return (
                      <button
                        key={trade.id}
                        type="button"
                        onClick={() => openNoteModal(trade)}
                        className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/20 transition p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="font-semibold">{trade.symbol}</div>
                            <Badge variant={side === 'BUY' ? 'success' : 'destructive'}>
                              {side}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{trade.lots} lot{trade.lots > 1 ? 's' : ''}</div>
                            {trade.note && (
                              <Badge variant="secondary">Analyse</Badge>
                            )}
                          </div>
                          <div className={"font-bold " + (pnl >= 0 ? 'text-green-500' : 'text-red-500')}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USD
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <div>
                            Entry: {Number(trade.entryPrice || 0).toFixed(5)} → Close: {Number(trade.closePrice || 0).toFixed(5)}
                          </div>
                          <div>
                            {date ? date.toLocaleString('fr-FR') : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card ref={savedAnchorRef}>
          <CardHeader>
            <CardTitle>Analyses sauvegardées</CardTitle>
          </CardHeader>
          <CardContent>
            {savedAnalyses.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Aucune analyse enregistrée pour le moment</div>
            ) : (
              <div className="space-y-4">
                {savedAnalyses.map((t) => {
                  const side = (t.side || '').toUpperCase();
                  const pnl = Number(t.pnl) || 0;
                  const date = toDate(t.closedAt || t.openedAt);
                  return (
                    <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <div className="font-semibold">{t.symbol}</div>
                            <Badge variant={side === 'BUY' ? 'success' : 'destructive'}>{side}</Badge>
                            <div className="text-xs text-muted-foreground">{date ? date.toLocaleDateString('fr-FR') : ''}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">{t.lots} lot{t.lots > 1 ? 's' : ''} · Entry {Number(t.entryPrice || 0).toFixed(5)} · Close {Number(t.closePrice || 0).toFixed(5)}</div>
                        </div>
                        <div className={"font-bold " + (pnl >= 0 ? 'text-green-500' : 'text-red-500')}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USD
                        </div>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
                        {t.note}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal pour ajouter/modifier une note */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-lg font-semibold">Analyse trade</div>
                <div className="text-xs text-muted-foreground">{selectedTrade.symbol} · {String(selectedTrade.side || '').toUpperCase()} · {selectedTrade.lots} lot(s)</div>
              </div>
              <Button type="button" variant="ghost" onClick={() => setSelectedTrade(null)}>
                Fermer
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Entry</div>
                  <div className="font-semibold">{Number(selectedTrade.entryPrice || 0).toFixed(5)}</div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Close</div>
                  <div className="font-semibold">{Number(selectedTrade.closePrice || 0).toFixed(5)}</div>
                </div>
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Écris ton analyse du trade ici... (setup, exécution, émotion, erreurs, leçon, etc.)"
                className="w-full h-44 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
              />

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedTrade(null)}>
                  Annuler
                </Button>
                <Button type="button" onClick={saveNote} disabled={!note.trim()}>
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
