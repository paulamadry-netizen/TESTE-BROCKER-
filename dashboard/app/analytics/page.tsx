"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  X,
  Save,
  Loader2,
  BarChart3,
  BookOpen
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  status: string;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load trades
  useEffect(() => {
    if (!user) return;
    loadTrades();
  }, [user]);

  // Filter trades by selected date
  useEffect(() => {
    if (!selectedDate) {
      setFilteredTrades(trades);
      return;
    }

    const filtered = trades.filter(trade => {
      const tradeDate = trade.closedAt?.toDate ? trade.closedAt.toDate() : new Date(trade.closedAt);
      return (
        tradeDate.getDate() === selectedDate.getDate() &&
        tradeDate.getMonth() === selectedDate.getMonth() &&
        tradeDate.getFullYear() === selectedDate.getFullYear()
      );
    });
    setFilteredTrades(filtered);
  }, [selectedDate, trades]);

  const loadTrades = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, "trades"),
        where("userId", "==", user.uid),
        where("status", "==", "closed"),
        orderBy("closedAt", "desc")
      );

      const snapshot = await getDocs(q);
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Trade));

      setTrades(tradesData);
      setFilteredTrades(tradesData);
    } catch (error) {
      console.error("Error loading trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!selectedTrade) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "trades", selectedTrade.id), {
        note: note.trim()
      });

      await loadTrades();
      setSelectedTrade(null);
      setNote("");
    } catch (error) {
      console.error("Error saving note:", error);
    } finally {
      setSaving(false);
    }
  };

  const openNoteModal = (trade: Trade) => {
    setSelectedTrade(trade);
    setNote(trade.note || "");
  };

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1; // Monday = 0
  };

  const getTradesForDay = (day: number) => {
    return trades.filter(trade => {
      const tradeDate = trade.closedAt?.toDate ? trade.closedAt.toDate() : new Date(trade.closedAt);
      return (
        tradeDate.getDate() === day &&
        tradeDate.getMonth() === currentMonth.getMonth() &&
        tradeDate.getFullYear() === currentMonth.getFullYear()
      );
    });
  };

  const getDayPnL = (day: number) => {
    const dayTrades = getTradesForDay(day);
    return dayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const selectDay = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (selectedDate &&
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === currentMonth.getMonth() &&
        selectedDate.getFullYear() === currentMonth.getFullYear()) {
      setSelectedDate(null); // Deselect if clicking same day
    } else {
      setSelectedDate(newDate);
    }
  };

  const formatTradeDate = (dateValue: any) => {
    try {
      const date = dateValue?.toDate ? dateValue.toDate() : new Date(dateValue);
      return date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "N/A";
    }
  };

  // Get trades with notes
  const tradesWithNotes = trades.filter(t => t.note && t.note.trim());

  // Stats
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const winRate = trades.length > 0 ? ((winningTrades.length / trades.length) * 100).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("analytics.title")}</h1>
        <p className="text-muted-foreground">{t("analytics.subtitle")}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold">{trades.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {totalPnL >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">P&L Total</p>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(totalPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{winRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <BookOpen className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Analyses</p>
                <p className="text-2xl font-bold">{tradesWithNotes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendrier
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-secondary rounded-lg transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold">
                {currentMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </h3>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-secondary rounded-lg transition"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
              <div>L</div>
              <div>M</div>
              <div>M</div>
              <div>J</div>
              <div>V</div>
              <div>S</div>
              <div>D</div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }).map((_, i) => {
                const firstDay = getFirstDayOfMonth(currentMonth);
                const daysInMonth = getDaysInMonth(currentMonth);
                const day = i - firstDay + 1;
                const isValidDay = day > 0 && day <= daysInMonth;
                const isToday =
                  day === new Date().getDate() &&
                  currentMonth.getMonth() === new Date().getMonth() &&
                  currentMonth.getFullYear() === new Date().getFullYear();
                const isSelected = selectedDate &&
                  day === selectedDate.getDate() &&
                  currentMonth.getMonth() === selectedDate.getMonth() &&
                  currentMonth.getFullYear() === selectedDate.getFullYear();
                const dayTrades = isValidDay ? getTradesForDay(day) : [];
                const dayPnL = isValidDay ? getDayPnL(day) : 0;
                const hasTrades = dayTrades.length > 0;

                return (
                  <button
                    key={i}
                    onClick={() => isValidDay && selectDay(day)}
                    disabled={!isValidDay}
                    className={`
                      aspect-square flex flex-col items-center justify-center text-sm rounded-lg transition relative
                      ${!isValidDay ? 'text-muted-foreground/30 cursor-default' : 'hover:bg-secondary cursor-pointer'}
                      ${isToday ? 'ring-2 ring-primary' : ''}
                      ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                      ${hasTrades && !isSelected ? (dayPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20') : ''}
                    `}
                  >
                    {isValidDay && (
                      <>
                        <span className="font-medium">{day}</span>
                        {hasTrades && (
                          <span className={`text-[10px] font-bold ${
                            isSelected ? '' : (dayPnL >= 0 ? 'text-green-500' : 'text-red-500')
                          }`}>
                            {dayTrades.length}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Date Info */}
            {selectedDate && (
              <div className="mt-4 p-3 bg-secondary rounded-lg">
                <p className="text-sm font-medium">
                  {selectedDate.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long"
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredTrades.length} trade{filteredTrades.length > 1 ? 's' : ''} ce jour
                </p>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-primary hover:underline mt-2"
                >
                  Voir tous les trades
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trades List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Journal de Trading
              </div>
              {selectedDate && (
                <Badge variant="secondary">
                  {selectedDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredTrades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucun trade {selectedDate ? 'ce jour' : 'fermé'}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {filteredTrades.map(trade => (
                  <div
                    key={trade.id}
                    onClick={() => openNoteModal(trade)}
                    className="p-4 bg-secondary/50 hover:bg-secondary rounded-lg cursor-pointer transition border border-transparent hover:border-primary/20"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">{trade.symbol}</span>
                        <Badge variant={trade.side === "BUY" ? "success" : "destructive"}>
                          {trade.side}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {trade.lots} lot{trade.lots > 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={`font-bold text-lg ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div>
                        Entry: {trade.entryPrice?.toFixed(5) || 'N/A'} → Close: {trade.closePrice?.toFixed(5) || 'N/A'}
                      </div>
                      <div>{formatTradeDate(trade.closedAt)}</div>
                    </div>

                    {trade.note && (
                      <div className="mt-3 p-3 bg-primary/5 rounded-lg border-l-4 border-primary">
                        <p className="text-sm">{trade.note}</p>
                      </div>
                    )}

                    {!trade.note && (
                      <p className="mt-2 text-xs text-muted-foreground italic">
                        Cliquez pour ajouter une analyse...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saved Analyses Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Mes Analyses Sauvegardées ({tradesWithNotes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tradesWithNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune analyse sauvegardée</p>
              <p className="text-sm mt-1">Cliquez sur un trade pour ajouter votre analyse</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tradesWithNotes.map(trade => (
                <div
                  key={trade.id}
                  onClick={() => openNoteModal(trade)}
                  className="p-4 bg-secondary/30 hover:bg-secondary/50 rounded-lg cursor-pointer transition border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{trade.symbol}</span>
                      <Badge variant={trade.side === "BUY" ? "success" : "destructive"} className="text-xs">
                        {trade.side}
                      </Badge>
                    </div>
                    <span className={`font-bold ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-3">{trade.note}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatTradeDate(trade.closedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-3">
                  {selectedTrade.symbol}
                  <Badge variant={selectedTrade.side === "BUY" ? "success" : "destructive"}>
                    {selectedTrade.side}
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatTradeDate(selectedTrade.closedAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedTrade(null)}
                className="p-2 hover:bg-secondary rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Trade Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-secondary/50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Entry</p>
                <p className="font-semibold">{selectedTrade.entryPrice?.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Close</p>
                <p className="font-semibold">{selectedTrade.closePrice?.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lots</p>
                <p className="font-semibold">{selectedTrade.lots}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">P&L</p>
                <p className={`font-bold ${selectedTrade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {selectedTrade.pnl >= 0 ? '+' : ''}{formatCurrency(selectedTrade.pnl)}
                </p>
              </div>
            </div>

            {/* Note Input */}
            <div className="mb-6">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Votre Analyse
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Écrivez votre analyse du trade... (stratégie utilisée, émotions ressenties, leçons apprises, ce que vous feriez différemment...)"
                className="w-full h-40 p-4 bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={saveNote}
                disabled={saving}
                className="flex-1 bg-primary text-primary-foreground py-3 px-4 rounded-lg hover:bg-primary/90 font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                Sauvegarder
              </button>
              <button
                onClick={() => setSelectedTrade(null)}
                className="px-6 py-3 border border-border rounded-lg hover:bg-secondary transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
