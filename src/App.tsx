import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { ArrowCounter } from '@/components/ArrowCounter';
import { SessionList } from '@/components/SessionList';
import { Stats } from '@/components/Stats';
import { History } from '@/components/History';
import { LocationMap } from '@/components/LocationMap';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useArrows } from '@/hooks/useArrows';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import './App.css';

function App() {
  const {
    todaySessions,
    todayTotal,
    weekTotal,
    monthTotal,
    allTimeTotal,
    bestDay,
    averagePerSession,
    history,
    locatedSessions,
    addArrows,
    addOneArrow,
    removeOneArrow,
    deleteSession,
    editSession,
    exportData,
    importData,
    clearAllData,
    formatNumber,
  } = useArrows();

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />
      <Header
        actions={
          <SettingsSheet
            onExport={exportData}
            onImport={importData}
            onClear={clearAllData}
          />
        }
      />

      <main
        className={`pt-14 pb-8 px-4 transition-all duration-500 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Arrow Counter Section */}
        <section className="max-w-md mx-auto">
          <ArrowCounter
            todayTotal={todayTotal}
            onAdd={addArrows}
            onAddOne={addOneArrow}
            onRemoveOne={removeOneArrow}
            formatNumber={formatNumber}
          />
        </section>

        {/* Tabs Section */}
        <section className="max-w-md mx-auto mt-4">
          <Tabs defaultValue="today" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="space-y-4">
              <SessionList
                sessions={todaySessions}
                formatNumber={formatNumber}
                onDelete={deleteSession}
                onEdit={editSession}
              />
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <Stats
                todayTotal={todayTotal}
                weekTotal={weekTotal}
                monthTotal={monthTotal}
                allTimeTotal={allTimeTotal}
                bestDay={bestDay}
                averagePerSession={averagePerSession}
                formatNumber={formatNumber}
              />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <History history={history} formatNumber={formatNumber} />
            </TabsContent>

            <TabsContent value="map" className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-primary mb-2">Shooting Locations</h2>
                {locatedSessions.length > 0 ? (
                  <LocationMap mode="viewer" sessions={locatedSessions} height="300px" />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No locations recorded yet. Add a location when logging arrows!
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

export default App;
