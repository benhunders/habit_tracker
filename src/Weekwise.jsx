import { useState, useEffect, useMemo } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────

// Color palette for categories (borrowed from innerlog's wheel colors)
const PALETTE = [
  '#60A5FA',
  '#34D399',
  '#A78BFA',
  '#F472B6',
  '#F59E0B',
  '#FB923C',
  '#22D3EE',
  '#A3E635',
  '#F87171',
  '#94A3B8',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_CATEGORIES = [
  { id: 'cat-work', name: 'Work', color: '#60A5FA' },
  { id: 'cat-health', name: 'Health', color: '#34D399' },
  { id: 'cat-personal', name: 'Personal', color: '#A78BFA' },
  { id: 'cat-relationships', name: 'Relationships', color: '#F472B6' },
];

const DEFAULT_HABITS = [
  { id: 'habit-water', name: 'Drink water', categoryId: 'cat-health' },
  { id: 'habit-read', name: 'Read 20 min', categoryId: 'cat-personal' },
];

const NAV = [
  { id: 'planner', label: 'Planner', emoji: '🗓️' },
  { id: 'habits', label: 'Habits', emoji: '✅' },
  { id: 'review', label: 'Review', emoji: '🔮' },
  { id: 'manage', label: 'Manage', emoji: '⚙️' },
];

// ── Utilities ──────────────────────────────────────────────────────────────

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday (ISO date string) of the week containing `date`
function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 7 Date objects (Mon..Sun) for a week starting at `weekStart`
function weekDays(weekStart) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function shiftWeek(weekStart, deltaWeeks) {
  const d = parseISO(weekStart);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return isoDate(d);
}

function formatWeekRange(weekStart) {
  const days = weekDays(weekStart);
  const opts = { month: 'short', day: 'numeric' };
  const first = days[0].toLocaleDateString('en-US', opts);
  const last = days[6].toLocaleDateString('en-US', opts);
  return `${first} – ${last}`;
}

// ── localStorage-backed state ────────────────────────────────────────────────

function useLocalStorageState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [key, state]);
  return [state, setState];
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function Weekwise() {
  const [view, setView] = useState('planner'); // planner | habits | review | manage
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  const [categories, setCategories] = useLocalStorageState('weekwise_categories', DEFAULT_CATEGORIES);
  const [tasks, setTasks] = useLocalStorageState('weekwise_tasks', []);
  const [habits, setHabits] = useLocalStorageState('weekwise_habits', DEFAULT_HABITS);
  const [habitLogs, setHabitLogs] = useLocalStorageState('weekwise_habitLogs', {});
  const [reviews, setReviews] = useLocalStorageState('weekwise_reviews', []);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const days = useMemo(() => weekDays(currentWeekStart), [currentWeekStart]);
  const todayISO = isoDate(new Date());

  const weekTasks = useMemo(
    () => tasks.filter((t) => t.weekStart === currentWeekStart),
    [tasks, currentWeekStart]
  );

  const categoryById = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const weekReview = useMemo(
    () => reviews.find((r) => r.weekStart === currentWeekStart) || null,
    [reviews, currentWeekStart]
  );

  // ── Task actions ───────────────────────────────────────────────────────────

  function addTask(day, categoryId, title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      { id: uid('task'), weekStart: currentWeekStart, day, categoryId, title: trimmed, done: false },
    ]);
  }

  function toggleTask(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Habit actions ──────────────────────────────────────────────────────────

  function toggleHabit(habitId, dateISO) {
    setHabitLogs((prev) => {
      const forHabit = { ...(prev[habitId] || {}) };
      if (forHabit[dateISO]) delete forHabit[dateISO];
      else forHabit[dateISO] = true;
      return { ...prev, [habitId]: forHabit };
    });
  }

  function habitCount(habitId) {
    const log = habitLogs[habitId] || {};
    return days.reduce((n, d) => n + (log[isoDate(d)] ? 1 : 0), 0);
  }

  function addHabit(name, categoryId) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setHabits((prev) => [...prev, { id: uid('habit'), name: trimmed, categoryId: categoryId || null }]);
  }

  function deleteHabit(id) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setHabitLogs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ── Category actions ───────────────────────────────────────────────────────

  function addCategory(name, color) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => [...prev, { id: uid('cat'), name: trimmed, color }]);
  }

  function deleteCategory(id) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  // ── AI weekly review ───────────────────────────────────────────────────────

  async function callClaude(payload) {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function generateReview() {
    setIsLoading(true);
    setError('');
    try {
      // Aggregate tasks per category
      const perCategory = categories
        .map((c) => {
          const catTasks = weekTasks.filter((t) => t.categoryId === c.id);
          return {
            name: c.name,
            done: catTasks.filter((t) => t.done).length,
            total: catTasks.length,
            titles: catTasks.map((t) => t.title),
          };
        })
        .filter((c) => c.total > 0);

      const habitsAgg = habits.map((h) => ({
        name: h.name,
        completed: habitCount(h.id),
        total: 7,
      }));

      const data = await callClaude({
        action: 'weekly_review',
        weekLabel: formatWeekRange(currentWeekStart),
        categories: perCategory,
        tasks: {
          done: weekTasks.filter((t) => t.done).length,
          total: weekTasks.length,
        },
        habits: habitsAgg,
      });

      const entry = {
        id: uid('review'),
        weekStart: currentWeekStart,
        result: data,
        generatedAt: new Date().toISOString(),
      };
      setReviews((prev) => [entry, ...prev.filter((r) => r.weekStart !== currentWeekStart)]);
    } catch (e) {
      console.error(e);
      setError('Could not generate your weekly review. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isThisWeek = currentWeekStart === getWeekStart(new Date());

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▦</span> weekwise
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-btn ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
            >
              <span className="nav-emoji">{n.emoji}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {view !== 'manage' && (
        <div className="weeknav">
          <button className="ghost-btn" onClick={() => setCurrentWeekStart((w) => shiftWeek(w, -1))}>
            ‹ Prev
          </button>
          <div className="weeknav-label">
            <strong>{formatWeekRange(currentWeekStart)}</strong>
            {!isThisWeek && (
              <button
                className="link-btn"
                onClick={() => setCurrentWeekStart(getWeekStart(new Date()))}
              >
                Today
              </button>
            )}
            {isThisWeek && <span className="pill">This week</span>}
          </div>
          <button className="ghost-btn" onClick={() => setCurrentWeekStart((w) => shiftWeek(w, 1))}>
            Next ›
          </button>
        </div>
      )}

      <main className="main">
        {view === 'planner' && (
          <PlannerView
            days={days}
            todayISO={todayISO}
            weekTasks={weekTasks}
            categories={categories}
            categoryById={categoryById}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
          />
        )}

        {view === 'habits' && (
          <HabitsView
            days={days}
            todayISO={todayISO}
            habits={habits}
            habitLogs={habitLogs}
            categoryById={categoryById}
            categories={categories}
            onToggleHabit={toggleHabit}
            habitCount={habitCount}
            onAddHabit={addHabit}
            onDeleteHabit={deleteHabit}
          />
        )}

        {view === 'review' && (
          <ReviewView
            review={weekReview}
            isLoading={isLoading}
            error={error}
            weekTasks={weekTasks}
            onGenerate={generateReview}
          />
        )}

        {view === 'manage' && (
          <ManageView
            categories={categories}
            habits={habits}
            categoryById={categoryById}
            onAddCategory={addCategory}
            onDeleteCategory={deleteCategory}
            onAddHabit={addHabit}
            onDeleteHabit={deleteHabit}
          />
        )}
      </main>
    </div>
  );
}

// ── Planner ──────────────────────────────────────────────────────────────────

function PlannerView({ days, todayISO, weekTasks, categories, categoryById, onAddTask, onToggleTask, onDeleteTask }) {
  const [openDay, setOpenDay] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCat, setDraftCat] = useState(categories[0]?.id || '');

  function submit(dayIndex) {
    onAddTask(dayIndex, draftCat || categories[0]?.id, draftTitle);
    setDraftTitle('');
    setOpenDay(null);
  }

  const doneCount = weekTasks.filter((t) => t.done).length;

  return (
    <div>
      <div className="section-head">
        <h2>Plan your week</h2>
        <span className="muted">
          {weekTasks.length === 0 ? 'No tasks yet' : `${doneCount}/${weekTasks.length} done`}
        </span>
      </div>

      <div className="planner-grid">
        {days.map((d, i) => {
          const dateISO = isoDate(d);
          const dayTasks = weekTasks.filter((t) => t.day === i);
          const isToday = dateISO === todayISO;
          return (
            <div key={i} className={`day-col ${isToday ? 'is-today' : ''}`}>
              <div className="day-head">
                <span className="day-name">{DAY_NAMES[i]}</span>
                <span className="day-num">{d.getDate()}</span>
              </div>

              <div className="day-tasks">
                {dayTasks.map((t) => {
                  const cat = categoryById[t.categoryId];
                  return (
                    <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
                      <label className="task-check">
                        <input type="checkbox" checked={t.done} onChange={() => onToggleTask(t.id)} />
                        <span className="dot" style={{ background: cat?.color || '#94A3B8' }} />
                        <span className="task-title">{t.title}</span>
                      </label>
                      <button className="x-btn" onClick={() => onDeleteTask(t.id)} aria-label="Delete">
                        ×
                      </button>
                    </div>
                  );
                })}
                {dayTasks.length === 0 && <div className="empty-day">—</div>}
              </div>

              {openDay === i ? (
                <div className="add-task">
                  <input
                    autoFocus
                    className="add-input"
                    placeholder="New task…"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submit(i);
                      if (e.key === 'Escape') setOpenDay(null);
                    }}
                  />
                  <select className="add-select" value={draftCat} onChange={(e) => setDraftCat(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="add-actions">
                    <button className="primary-btn small" onClick={() => submit(i)}>
                      Add
                    </button>
                    <button className="ghost-btn small" onClick={() => setOpenDay(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="add-trigger"
                  onClick={() => {
                    setOpenDay(i);
                    setDraftTitle('');
                    setDraftCat(categories[0]?.id || '');
                  }}
                >
                  + Add
                </button>
              )}
            </div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <p className="hint">Add a category in <strong>Manage</strong> to start planning tasks.</p>
      )}
    </div>
  );
}

// ── Habits ───────────────────────────────────────────────────────────────────

function HabitsView({ days, todayISO, habits, habitLogs, categoryById, categories, onToggleHabit, habitCount, onAddHabit, onDeleteHabit }) {
  const [name, setName] = useState('');
  const [catId, setCatId] = useState(categories[0]?.id || '');

  return (
    <div>
      <div className="section-head">
        <h2>Habit tracker</h2>
        <span className="muted">{habits.length} habit{habits.length === 1 ? '' : 's'}</span>
      </div>

      {habits.length === 0 ? (
        <p className="hint">No habits yet — add one below to start tracking.</p>
      ) : (
        <div className="habit-table-wrap">
          <table className="habit-table">
            <thead>
              <tr>
                <th className="habit-name-col">Habit</th>
                {days.map((d, i) => (
                  <th key={i} className={isoDate(d) === todayISO ? 'is-today' : ''}>
                    <div className="th-day">{DAY_NAMES[i]}</div>
                    <div className="th-num">{d.getDate()}</div>
                  </th>
                ))}
                <th className="habit-count-col">Done</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const cat = categoryById[h.categoryId];
                return (
                  <tr key={h.id}>
                    <td className="habit-name-col">
                      <span className="dot" style={{ background: cat?.color || '#94A3B8' }} />
                      {h.name}
                    </td>
                    {days.map((d, i) => {
                      const dateISO = isoDate(d);
                      const checked = !!(habitLogs[h.id] && habitLogs[h.id][dateISO]);
                      return (
                        <td key={i} className="habit-cell">
                          <button
                            className={`hcheck ${checked ? 'on' : ''}`}
                            style={checked ? { background: cat?.color || '#34D399', borderColor: cat?.color || '#34D399' } : undefined}
                            onClick={() => onToggleHabit(h.id, dateISO)}
                            aria-label={`${h.name} ${DAY_NAMES[i]}`}
                          >
                            {checked ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                    <td className="habit-count-col">{habitCount(h.id)}/7</td>
                    <td>
                      <button className="x-btn" onClick={() => onDeleteHabit(h.id)} aria-label="Delete habit">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="inline-add">
        <input
          className="add-input"
          placeholder="New habit…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onAddHabit(name, catId || categories[0]?.id);
              setName('');
            }
          }}
        />
        <select className="add-select" value={catId} onChange={(e) => setCatId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="primary-btn small"
          onClick={() => {
            onAddHabit(name, catId || categories[0]?.id);
            setName('');
          }}
        >
          Add habit
        </button>
      </div>
    </div>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

function ReviewView({ review, isLoading, error, weekTasks, onGenerate }) {
  const r = review?.result;

  return (
    <div>
      <div className="section-head">
        <h2>Weekly review</h2>
        {review && (
          <span className="muted">
            generated {new Date(review.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {!r && !isLoading && (
        <div className="review-empty">
          <p className="hint">
            Let Claude look at how your week went — what you planned vs. finished, your habit
            streaks, and how your energy was spread across categories — then suggest adjustments for
            next week.
          </p>
          <button className="primary-btn" onClick={onGenerate} disabled={weekTasks.length === 0}>
            {weekTasks.length === 0 ? 'Plan some tasks first' : 'Generate weekly review'}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="loading">
          <div className="spinner" />
          <p>Claude is reviewing your week…</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {r && !isLoading && (
        <div className="review">
          <div className="review-card">
            <h3>Summary</h3>
            <p>{r.summary}</p>
          </div>

          <div className="review-2col">
            <div className="review-card">
              <h3>✨ Wins</h3>
              <ul>{(r.wins || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
            <div className="review-card">
              <h3>🌧️ Challenges</h3>
              <ul>{(r.challenges || []).map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          </div>

          <div className="review-card">
            <h3>⚖️ Category balance</h3>
            <p>{r.categoryBalance}</p>
          </div>

          <div className="review-card">
            <h3>🔁 Habit insights</h3>
            <ul>{(r.habitInsights || []).map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>

          <div className="review-card highlight">
            <h3>🎯 Suggestions for next week</h3>
            <ul>{(r.suggestions || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>

          <button className="ghost-btn" onClick={onGenerate}>
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

// ── Manage ───────────────────────────────────────────────────────────────────

function ManageView({ categories, habits, categoryById, onAddCategory, onDeleteCategory, onAddHabit, onDeleteHabit }) {
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(PALETTE[0]);
  const [habitName, setHabitName] = useState('');
  const [habitCat, setHabitCat] = useState(categories[0]?.id || '');

  return (
    <div className="manage">
      <div className="section-head">
        <h2>Manage</h2>
      </div>

      <section className="manage-section">
        <h3>Categories</h3>
        <div className="chip-list">
          {categories.map((c) => (
            <div key={c.id} className="chip" style={{ borderColor: c.color }}>
              <span className="dot" style={{ background: c.color }} />
              {c.name}
              <button className="x-btn" onClick={() => onDeleteCategory(c.id)} aria-label="Delete category">
                ×
              </button>
            </div>
          ))}
          {categories.length === 0 && <span className="muted">No categories yet.</span>}
        </div>
        <div className="inline-add">
          <input
            className="add-input"
            placeholder="New category…"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAddCategory(catName, catColor);
                setCatName('');
              }
            }}
          />
          <div className="swatches">
            {PALETTE.map((color) => (
              <button
                key={color}
                className={`swatch ${catColor === color ? 'sel' : ''}`}
                style={{ background: color }}
                onClick={() => setCatColor(color)}
                aria-label={`Pick ${color}`}
              />
            ))}
          </div>
          <button
            className="primary-btn small"
            onClick={() => {
              onAddCategory(catName, catColor);
              setCatName('');
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="manage-section">
        <h3>Habits</h3>
        <div className="chip-list">
          {habits.map((h) => {
            const cat = categoryById[h.categoryId];
            return (
              <div key={h.id} className="chip" style={{ borderColor: cat?.color || '#94A3B8' }}>
                <span className="dot" style={{ background: cat?.color || '#94A3B8' }} />
                {h.name}
                <button className="x-btn" onClick={() => onDeleteHabit(h.id)} aria-label="Delete habit">
                  ×
                </button>
              </div>
            );
          })}
          {habits.length === 0 && <span className="muted">No habits yet.</span>}
        </div>
        <div className="inline-add">
          <input
            className="add-input"
            placeholder="New habit…"
            value={habitName}
            onChange={(e) => setHabitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAddHabit(habitName, habitCat || categories[0]?.id);
                setHabitName('');
              }
            }}
          />
          <select className="add-select" value={habitCat} onChange={(e) => setHabitCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="primary-btn small"
            onClick={() => {
              onAddHabit(habitName, habitCat || categories[0]?.id);
              setHabitName('');
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
