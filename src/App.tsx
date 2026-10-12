import { useEffect, useMemo, useState } from 'react'

type Muscle = { id: string; name: string; parentId: string | null }
type Exercise = { id: string; name: string; muscleId: string; notes: string; youtube: string }
type PlanExercise = { exerciseId: string; sets?: number; reps?: number }
type Plan = { id: string; name: string; weekday: number | null; exercises: PlanExercise[] }
type ActualSet = { reps: number; weight: number; unit: 'kg' | 'lb'; workSeconds: number; restSeconds: number }
type ExerciseLog = {
  id: string; date: string; planId: string; exerciseId: string; exerciseName: string; planName: string
  startedAt: number; completedAt: number; targetSets: number; targetReps: number; suggestion: { sets: number; reps: number }
  sets: ActualSet[]
}
type Progression = { sets: number; reps: number; defaultSets: number; defaultReps: number }
type ActiveExercise = {
  planId: string; planName: string; exerciseId: string; exerciseName: string; targetSets: number; targetReps: number
  suggestion: { sets: number; reps: number }; startedAt: number; phase: 'work' | 'entry' | 'rest'
  workStartedAt: number | null; restStartedAt: number | null; pendingWorkSeconds: number; entryReps: string; entryWeight: string
  sets: ActualSet[]
}
type AppData = {
  muscles: Muscle[]; exercises: Exercise[]; plans: Plan[]; logs: ExerciseLog[]
  defaults: { sets: number; reps: number; unit: 'kg' | 'lb' }
  progression: Record<string, Progression>; active: ActiveExercise | null
}

const STORAGE_KEY = 'form-workout-data-v1'
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const makeId = () => crypto.randomUUID()
const initialData: AppData = {
  muscles: [{ id: 'body', name: 'Body', parentId: null }], exercises: [], plans: [], logs: [],
  defaults: { sets: 3, reps: 8, unit: 'kg' }, progression: {}, active: null,
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppData>
      return {
        ...initialData, ...saved,
        defaults: { ...initialData.defaults, ...saved.defaults },
        muscles: saved.muscles?.length ? saved.muscles : initialData.muscles,
      }
    }
  } catch { /* Start clean if local data cannot be read. */ }
  return initialData
}

const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  return hours ? `${hours}:${String(Math.floor((safe % 3600) / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}` : `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}
const formatDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const cleanYoutubeUrl = (value: string) => value.trim()
const secondsBetween = (start: number | null, end = Date.now()) => start ? Math.max(0, Math.floor((end - start) / 1000)) : 0
const convertWeight = (weight: number, from: 'kg' | 'lb', to: 'kg' | 'lb') => from === to ? weight : from === 'kg' ? weight * 2.20462 : weight / 2.20462

function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [page, setPage] = useState('Home')
  const [selectedHistoryExercise, setSelectedHistoryExercise] = useState<Exercise | null>(null)
  const [now, setNow] = useState(Date.now())
  const [notice, setNotice] = useState('')
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [muscleName, setMuscleName] = useState('')
  const [muscleParent, setMuscleParent] = useState('body')
  const [exerciseName, setExerciseName] = useState('')
  const [exerciseMuscle, setExerciseMuscle] = useState('body')
  const [exerciseNotes, setExerciseNotes] = useState('')
  const [exerciseYoutube, setExerciseYoutube] = useState('')
  const [planName, setPlanName] = useState('')
  const [planWeekday, setPlanWeekday] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const today = new Date()
  const todaysPlans = useMemo(() => data.plans.filter((plan) => plan.weekday === today.getDay()), [data.plans, today])
  const todayExercises = todaysPlans.reduce((count, plan) => count + plan.exercises.length, 0)
  const todayCompleted = data.logs.filter((log) => log.date === dateKey() && todaysPlans.some((plan) => plan.id === log.planId)).length
  const archivedPlans = data.plans.filter((plan) => plan.weekday === null)
  const muscleMap = new Map(data.muscles.map((muscle) => [muscle.id, muscle]))
  const exerciseMap = new Map(data.exercises.map((exercise) => [exercise.id, exercise]))
  const muscleExerciseCounts = new Map<string, number>()
  data.exercises.forEach((exercise) => muscleExerciseCounts.set(exercise.muscleId, (muscleExerciseCounts.get(exercise.muscleId) ?? 0) + 1))

  const musclePath = (muscleId: string) => {
    const names: string[] = []
    let current = muscleMap.get(muscleId)
    while (current) {
      names.unshift(current.name)
      current = current.parentId ? muscleMap.get(current.parentId) : undefined
    }
    return names.join(' / ')
  }
  const getTargets = (plan: Plan, exerciseId: string) => {
    const item = plan.exercises.find((entry) => entry.exerciseId === exerciseId)
    return { sets: item?.sets || data.defaults.sets, reps: item?.reps || data.defaults.reps }
  }
  const progressionKey = (exerciseId: string, sets: number, reps: number) => `${exerciseId}:${sets}:${reps}`
  const getSuggestion = (exerciseId: string, targetSets: number, targetReps: number) => {
    const saved = data.progression[progressionKey(exerciseId, targetSets, targetReps)]
    if (saved) return { sets: Math.min(targetSets, Math.max(1, saved.sets)), reps: targetReps }
    const previous = [...data.logs].reverse().find((log) => log.exerciseId === exerciseId)
    if (!previous) return { sets: targetSets, reps: targetReps }
    const successfulSets = previous.sets.filter((set) => set.reps >= targetReps).length
    return { sets: Math.min(targetSets, Math.max(1, successfulSets + 1)), reps: targetReps }
  }
  const currentSessionDone = (planId: string, exerciseId: string) => data.logs.some((log) => log.planId === planId && log.exerciseId === exerciseId && log.date === dateKey())

  const saveMuscle = () => {
    const name = muscleName.trim()
    if (!name) return
    setData((current) => ({ ...current, muscles: [...current.muscles, { id: makeId(), name, parentId: muscleParent }] }))
    setMuscleName('')
    setNotice('Muscle added')
  }
  const removeMuscle = (id: string) => {
    if (id === 'body') return
    if (data.muscles.some((muscle) => muscle.parentId === id) || data.exercises.some((exercise) => exercise.muscleId === id)) {
      setNotice('Move its child muscles and exercises before deleting it')
      return
    }
    setData((current) => ({ ...current, muscles: current.muscles.filter((muscle) => muscle.id !== id) }))
  }
  const resetExerciseForm = () => {
    setEditingExercise(null); setExerciseName(''); setExerciseMuscle('body'); setExerciseNotes(''); setExerciseYoutube('')
  }
  const editExercise = (exercise: Exercise) => {
    setEditingExercise(exercise); setExerciseName(exercise.name); setExerciseMuscle(exercise.muscleId)
    setExerciseNotes(exercise.notes); setExerciseYoutube(exercise.youtube)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const saveExercise = () => {
    const name = exerciseName.trim()
    if (!name || !exerciseMuscle) return
    const next: Exercise = { id: editingExercise?.id ?? makeId(), name, muscleId: exerciseMuscle, notes: exerciseNotes.trim(), youtube: cleanYoutubeUrl(exerciseYoutube) }
    setData((current) => ({ ...current, exercises: editingExercise ? current.exercises.map((item) => item.id === next.id ? next : item) : [...current.exercises, next] }))
    resetExerciseForm(); setNotice(editingExercise ? 'Exercise updated' : 'Exercise added')
  }
  const removeExercise = (id: string) => {
    if (data.plans.some((plan) => plan.exercises.some((item) => item.exerciseId === id))) {
      setNotice('Remove this exercise from its plans before deleting it'); return
    }
    setData((current) => ({ ...current, exercises: current.exercises.filter((exercise) => exercise.id !== id) }))
  }
  const startNewPlan = () => { setEditingPlan(null); setPlanName(''); setPlanWeekday(''); setPage('Plans') }
  const editPlan = (plan: Plan) => { setEditingPlan(plan); setPlanName(plan.name); setPlanWeekday(plan.weekday === null ? '' : String(plan.weekday)); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const savePlan = () => {
    const name = planName.trim()
    if (!name) return
    if (editingPlan) {
      setData((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === editingPlan.id ? { ...plan, name, weekday: planWeekday === '' ? null : Number(planWeekday) } : plan) }))
      setEditingPlan(null)
    } else {
      const created: Plan = { id: makeId(), name, weekday: planWeekday === '' ? null : Number(planWeekday), exercises: [] }
      setData((current) => ({ ...current, plans: [...current.plans, created] }))
    }
    setPlanName(''); setPlanWeekday(''); setNotice('Plan saved')
  }
  const togglePlanExercise = (plan: Plan, exerciseId: string) => {
    const present = plan.exercises.some((item) => item.exerciseId === exerciseId)
    setData((current) => ({ ...current, plans: current.plans.map((entry) => entry.id !== plan.id ? entry : {
      ...entry, exercises: present ? entry.exercises.filter((item) => item.exerciseId !== exerciseId) : [...entry.exercises, { exerciseId }],
    }) }))
  }
  const updatePlanTarget = (plan: Plan, exerciseId: string, field: 'sets' | 'reps', value: string) => {
    setData((current) => ({ ...current, plans: current.plans.map((entry) => {
      if (entry.id !== plan.id) return entry
      const exercises = entry.exercises.map((item) => item.exerciseId === exerciseId ? { ...item, [field]: value ? Math.max(1, Number(value)) : undefined } : item)
      return { ...entry, exercises }
    }) }))
  }
  const deletePlan = (id: string) => {
    setData((current) => ({ ...current, plans: current.plans.filter((plan) => plan.id !== id) }))
    setNotice('Plan deleted')
  }

  const startExercise = (plan: Plan, exercise: Exercise) => {
    const targets = getTargets(plan, exercise.id)
    const suggestion = getSuggestion(exercise.id, targets.sets, targets.reps)
    const previousLog = [...data.logs].reverse().find((log) => log.exerciseId === exercise.id)
    const lastSet = previousLog?.sets.at(-1)
    const previousWeight = lastSet ? Math.round(convertWeight(lastSet.weight, lastSet.unit ?? data.defaults.unit, data.defaults.unit) * 100) / 100 : 0
    setData((current) => ({ ...current, active: {
      planId: plan.id, planName: plan.name, exerciseId: exercise.id, exerciseName: exercise.name,
      targetSets: targets.sets, targetReps: targets.reps, suggestion, startedAt: Date.now(), phase: 'work',
      workStartedAt: Date.now(), restStartedAt: null, pendingWorkSeconds: 0, entryReps: String(suggestion.reps),
      entryWeight: String(previousWeight), sets: [],
    } }))
  }
  const stopSet = () => {
    if (!data.active?.workStartedAt) return
    setData((current) => current.active ? { ...current, active: { ...current.active, phase: 'entry', pendingWorkSeconds: secondsBetween(current.active.workStartedAt), workStartedAt: null, restStartedAt: Date.now() } } : current)
  }
  const saveSet = () => {
    if (!data.active) return
    const reps = Number(data.active.entryReps)
    const weight = Number(data.active.entryWeight)
    if (!Number.isFinite(reps) || reps < 0 || !Number.isFinite(weight) || weight < 0) return
    const set: ActualSet = { reps, weight, unit: data.defaults.unit, workSeconds: data.active.pendingWorkSeconds, restSeconds: 0 }
    setData((current) => current.active ? { ...current, active: {
      ...current.active, phase: 'rest', workStartedAt: null, pendingWorkSeconds: 0,
      sets: [...current.active.sets, set], entryReps: String(current.active.suggestion.reps), entryWeight: String(weight),
    } } : current)
  }
  const resumeSet = () => {
    if (!data.active) return
    const elapsedRest = secondsBetween(data.active.restStartedAt)
    setData((current) => current.active ? { ...current, active: {
      ...current.active, phase: 'work', workStartedAt: Date.now(), restStartedAt: null,
      sets: current.active.sets.map((set, index) => index === current.active!.sets.length - 1 ? { ...set, restSeconds: elapsedRest } : set),
    } } : current)
  }
  const finishExercise = () => {
    const active = data.active
    if (!active) return
    let sets = active.sets
    if (active.phase === 'work' && active.workStartedAt && active.sets.length === 0) {
      setNotice('Complete at least one set to save this exercise'); return
    }
    if (active.phase === 'entry') { setNotice('Save the set or discard it before finishing'); return }
    if (active.phase === 'work' && active.sets.length) {
      sets = active.sets.map((set, index) => index === active.sets.length - 1 ? { ...set, restSeconds: 0 } : set)
    }
    const log: ExerciseLog = {
      id: makeId(), date: dateKey(new Date(active.startedAt)), planId: active.planId, exerciseId: active.exerciseId,
      exerciseName: active.exerciseName, planName: active.planName, startedAt: active.startedAt, completedAt: Date.now(),
      targetSets: active.targetSets, targetReps: active.targetReps, suggestion: active.suggestion, sets,
    }
    const key = progressionKey(active.exerciseId, active.targetSets, active.targetReps)
    const currentProgress = data.progression[key]
    let nextSets = active.suggestion.sets
    const successfulSets = sets.filter((set) => set.reps >= active.suggestion.reps).length
    const achievedSuggestion = successfulSets >= active.suggestion.sets
    if (currentProgress) {
      if (successfulSets >= active.targetSets) nextSets = active.targetSets
      else if (achievedSuggestion) nextSets = Math.min(active.targetSets, active.suggestion.sets + 1)
    } else {
      nextSets = Math.min(active.targetSets, Math.max(1, successfulSets + 1))
    }
    setData((current) => ({
      ...current, active: null, logs: [...current.logs, log],
      progression: { ...current.progression, [key]: { sets: nextSets, reps: active.targetReps, defaultSets: active.targetSets, defaultReps: active.targetReps } },
    }))
    setNotice(`${active.exerciseName} saved to history`)
  }
  const discardActive = () => { setData((current) => ({ ...current, active: null })); setNotice('Exercise session discarded') }

  const navItems = [
    { name: 'Home', symbol: '⌂' }, { name: 'Plans', symbol: '▤' }, { name: 'History', symbol: '◷' },
    { name: 'Exercises', symbol: '◉' }, { name: 'Muscles', symbol: '⌘' }, { name: 'Settings', symbol: '⚙' },
  ]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark">R</div><div className="brand-name">rep rally<span>.</span></div>
      <div className="side-caption">YOUR TRAINING</div>
      <nav>{navItems.map((item) => <button key={item.name} className={`nav-link ${page === item.name ? 'selected' : ''}`} onClick={() => setPage(item.name)}><span className="nav-symbol">{item.symbol}</span>{item.name}</button>)}</nav>
      <div className="sidebar-bottom"><span className="privacy-dot" /> Stored on this device</div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark small">R</span> rep rally<span>.</span></div><div className="topbar-date">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><div className="topbar-avatar">{data.defaults.unit.toUpperCase()}</div></header>
      <div className="mobile-tabs">{navItems.map((item) => <button key={item.name} className={page === item.name ? 'selected' : ''} onClick={() => setPage(item.name)}><span>{item.symbol}</span>{item.name}</button>)}</div>
      <div className="page-content">
        {page === 'Home' && <section>
          <div className="eyebrow">{weekdays[today.getDay()].toUpperCase()} · WEEKLY PLAN</div>
          <h1>Today’s workout</h1>
          <p className="lead">A little progress, one session at a time.</p>
          {data.active && <div className="active-banner"><div><b>{data.active.exerciseName}</b><span>Your exercise timer is running · {formatDuration(data.active.phase === 'work' ? secondsBetween(data.active.workStartedAt, now) : data.active.phase === 'rest' ? secondsBetween(data.active.restStartedAt, now) : data.active.pendingWorkSeconds)}</span></div><span className="timer-active-label">Exercise in progress</span></div>}
          <div className="dashboard-grid">
            <div className="dashboard-tile dashboard-tile-main"><span className="tile-kicker">TODAY / {weekdays[today.getDay()].toUpperCase()}</span><strong>{todayCompleted}<i>/{todayExercises}</i></strong><span className="tile-caption">exercises completed</span><div className="tile-meter"><span style={{ width: `${todayExercises ? Math.min(100, todayCompleted / todayExercises * 100) : 0}%` }} /></div></div>
            <div className="dashboard-tile"><span className="tile-kicker">ON THE SCHEDULE</span><strong>{todaysPlans.length.toString().padStart(2, '0')}</strong><span className="tile-caption">{todaysPlans.length === 1 ? 'workout plan' : 'workout plans'}</span><span className="tile-stamp">{todaysPlans.length ? 'READY' : 'REST DAY'}</span></div>
            <div className="dashboard-tile dashboard-tile-accent"><span className="tile-kicker">YOUR LIBRARY</span><strong>{data.exercises.length.toString().padStart(2, '0')}</strong><span className="tile-caption">moves in rotation</span><span className="tile-orbit">✳</span></div>
          </div>
          {!data.exercises.length && <div className="empty-card welcome-card"><div className="empty-icon">✳</div><div className="eyebrow">START WITH THE BASICS</div><h2>Build your workout library</h2><p>Add your muscle groups and exercises, then create a weekly plan.</p><button className="button dark" onClick={() => setPage('Muscles')}>Set up muscles <span>→</span></button></div>}
          {data.exercises.length > 0 && todaysPlans.length === 0 && <div className="empty-card"><div className="empty-icon">◷</div><h2>No workout planned for today</h2><p>Assign a plan to {weekdays[today.getDay()]} to see it here. Plans without a day stay in your archive.</p><button className="button dark" onClick={startNewPlan}>Create a plan <span>→</span></button></div>}
          {todaysPlans.map((plan) => <article className="workout-card" key={plan.id}>
            <div className="card-heading"><div><div className="eyebrow">{weekdays[today.getDay()]} PLAN</div><h2>{plan.name}</h2></div><button className="text-button" onClick={() => { setPage('Plans'); editPlan(plan) }}>Edit plan ↗</button></div>
            {!plan.exercises.length && <div className="inline-empty">No exercises yet. Add exercises in Plans to build this workout.</div>}
            <div className="workout-list">{plan.exercises.map((item, index) => {
              const exercise = exerciseMap.get(item.exerciseId)
              if (!exercise) return null
              const targets = getTargets(plan, exercise.id)
              const suggestion = getSuggestion(exercise.id, targets.sets, targets.reps)
              const complete = currentSessionDone(plan.id, exercise.id)
              return <div className={`workout-exercise ${complete ? 'is-done' : ''}`} key={exercise.id}>
                <div className="exercise-number">{complete ? '✓' : String(index + 1).padStart(2, '0')}</div>
                <div className="workout-exercise-info"><h3>{exercise.name}</h3><span>{musclePath(exercise.muscleId)} · {suggestion.sets} × {suggestion.reps} suggested</span></div>
                {complete ? <span className="done-pill">Done</span> : <button className="button outline small-button" disabled={Boolean(data.active)} onClick={() => startExercise(plan, exercise)}>{data.active ? 'In progress' : 'Begin'} <span>→</span></button>}
              </div>
            })}</div>
          </article>)}
          {todaysPlans.length > 0 && <div className="home-footnote"><span className="privacy-dot" /> Your workout history is saved on this device.</div>}
          <div className="recent-heading"><div><div className="eyebrow">KEEP THE MOMENTUM</div><h2>Recent sessions</h2></div><button className="text-button" onClick={() => setPage('History')}>View history ↗</button></div>
          {data.logs.length ? <div className="recent-list">{[...data.logs].reverse().slice(0, 3).map((log) => <div className="recent-row" key={log.id}><div className="recent-date">{formatDay(log.date)}</div><b>{log.exerciseName}</b><span>{log.sets.length} sets · {log.sets.reduce((sum, set) => sum + set.reps, 0)} total reps</span></div>)}</div> : <div className="small-muted">Your completed exercises will show up here.</div>}
        </section>}

        {page === 'Muscles' && <section>
          <div className="eyebrow">SETTINGS · STRUCTURE</div><h1>Muscle tree</h1><p className="lead">Organize muscles under Body. Exercises can belong to any level.</p>
          <div className="form-card"><div className="form-title">Add a muscle</div><div className="form-row"><label className="field grow">Muscle name<input value={muscleName} onChange={(event) => setMuscleName(event.target.value)} placeholder="e.g. Arm" onKeyDown={(event) => event.key === 'Enter' && saveMuscle()} /></label><label className="field">Parent muscle<select value={muscleParent} onChange={(event) => setMuscleParent(event.target.value)}>{data.muscles.map((muscle) => <option key={muscle.id} value={muscle.id}>{musclePath(muscle.id)}</option>)}</select></label><button className="button dark align-bottom" onClick={saveMuscle}>Add muscle</button></div></div>
          <div className="section-label">YOUR MUSCLE TREE <span>{data.muscles.length} groups</span></div>
          <div className="tree-card">{data.muscles.filter((muscle) => !muscle.parentId).map((root) => <MuscleBranch key={root.id} muscle={root} all={data.muscles} counts={muscleExerciseCounts} onDelete={removeMuscle} depth={0} />)}</div>
        </section>}

        {page === 'Exercises' && <section>
          <div className="eyebrow">YOUR MOVEMENT LIBRARY</div><h1>Exercises</h1><p className="lead">Add an exercise and link it to any muscle group.</p>
          <div className="form-card"><div className="form-title">{editingExercise ? 'Edit exercise' : 'Add an exercise'}</div><div className="exercise-form-grid">
            <label className="field">Exercise name *<input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="e.g. Dumbbell curl" /></label>
            <label className="field">Muscle *<select value={exerciseMuscle} onChange={(event) => setExerciseMuscle(event.target.value)}>{data.muscles.map((muscle) => <option key={muscle.id} value={muscle.id}>{musclePath(muscle.id)}</option>)}</select></label>
            <label className="field full-field">How to perform <textarea rows={2} value={exerciseNotes} onChange={(event) => setExerciseNotes(event.target.value)} placeholder="Optional notes or cues" /></label>
            <label className="field full-field">YouTube link <input type="url" value={exerciseYoutube} onChange={(event) => setExerciseYoutube(event.target.value)} placeholder="https://youtube.com/..." /></label>
          </div><div className="form-actions"><button className="button dark" disabled={!exerciseName.trim()} onClick={saveExercise}>{editingExercise ? 'Save changes' : 'Add exercise'}</button>{editingExercise && <button className="text-button" onClick={resetExerciseForm}>Cancel</button>}</div></div>
          <div className="section-label">EXERCISE LIBRARY <span>{data.exercises.length} exercises</span></div>
          {data.exercises.length ? <div className="library-list">{data.exercises.map((exercise) => <article className="library-item" key={exercise.id}><div className="exercise-glyph">↗</div><div className="library-info"><h3>{exercise.name}</h3><span>{musclePath(exercise.muscleId)}</span>{exercise.notes && <p>{exercise.notes}</p>}{exercise.youtube && <a href={exercise.youtube} target="_blank" rel="noreferrer">Watch video ↗</a>}</div><div className="item-actions"><button className="text-button" onClick={() => { setSelectedHistoryExercise(exercise); setPage('Exercise history') }}>Progress</button><button className="text-button" onClick={() => editExercise(exercise)}>Edit</button><button className="icon-button" aria-label={`Delete ${exercise.name}`} onClick={() => removeExercise(exercise.id)}>×</button></div></article>)}</div> : <div className="empty-card compact-empty">No exercises yet. Add your first exercise above.</div>}
        </section>}

        {page === 'Plans' && <section>
          <div className="eyebrow">MAKE IT A ROUTINE</div><h1>Workout plans</h1><p className="lead">Create a plan, choose its weekday, and pick the exercises to include.</p>
          <div className="form-card"><div className="form-title">{editingPlan ? 'Edit plan' : 'Create a plan'}</div><div className="form-row"><label className="field grow">Plan name<input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="e.g. Upper body" /></label><label className="field">Weekday<select value={planWeekday} onChange={(event) => setPlanWeekday(event.target.value)}><option value="">Archive · no day</option>{weekdays.slice(1).concat(weekdays[0]).map((day) => <option key={day} value={weekdays.indexOf(day)}>{day}</option>)}</select></label><button className="button dark align-bottom" disabled={!planName.trim()} onClick={savePlan}>{editingPlan ? 'Save plan' : 'Create plan'}</button>{editingPlan && <button className="text-button align-bottom" onClick={() => { setEditingPlan(null); setPlanName(''); setPlanWeekday('') }}>Cancel</button>}</div></div>
          {!data.plans.length && <div className="empty-card compact-empty">Your plans will appear here. Plans without a weekday are saved in the archive.</div>}
          {data.plans.filter((plan) => plan.weekday !== null).sort((a, b) => a.weekday! - b.weekday!).map((plan) => <PlanCard key={plan.id} plan={plan} exercises={data.exercises} muscles={data.muscles} defaults={data.defaults} onEdit={editPlan} onDelete={deletePlan} onToggle={togglePlanExercise} onTarget={updatePlanTarget} />)}
          {!!archivedPlans.length && <><div className="section-label archive-title">ARCHIVE <span>{archivedPlans.length} plans</span></div>{archivedPlans.map((plan) => <PlanCard key={plan.id} plan={plan} exercises={data.exercises} muscles={data.muscles} defaults={data.defaults} onEdit={editPlan} onDelete={deletePlan} onToggle={togglePlanExercise} onTarget={updatePlanTarget} />)}</>}
        </section>}

        {page === 'History' && <section>
          <div className="eyebrow">YOUR WORK, OVER TIME</div><h1>History</h1><p className="lead">Every completed exercise session, including work and rest time.</p>
          {!data.logs.length ? <div className="empty-card"><div className="empty-icon">◷</div><h2>Your history starts with a session</h2><p>Complete an exercise from today’s plan and it will be saved here.</p><button className="button dark" onClick={() => setPage('Home')}>Go to today <span>→</span></button></div> : <div className="history-list">{[...data.logs].reverse().map((log) => <article className="history-card" key={log.id}><div className="history-date"><span>{formatDay(log.date)}</span><small>{log.planName}</small></div><div className="history-main"><h3>{log.exerciseName}</h3><div className="history-target">Suggested {log.suggestion.sets} × {log.suggestion.reps} · Default {log.targetSets} × {log.targetReps}</div><div className="set-chips">{log.sets.map((set, index) => <span className="set-chip" key={`${log.id}-${index}`}>Set {index + 1}: {set.reps} reps · {set.weight} {set.unit ?? data.defaults.unit}<small>work {formatDuration(set.workSeconds)}{index < log.sets.length - 1 && set.restSeconds ? ` · rest ${formatDuration(set.restSeconds)}` : ''}</small></span>)}</div></div><div className="history-duration"><b>{formatDuration(log.sets.reduce((sum, set) => sum + set.workSeconds + set.restSeconds, 0))}</b><span>total logged</span></div></article>)}</div>}
        </section>}

        {page === 'Exercise history' && selectedHistoryExercise && <ExerciseProgress
          exercise={selectedHistoryExercise}
          logs={data.logs.filter((log) => log.exerciseId === selectedHistoryExercise.id)}
          unit={data.defaults.unit}
          musclePath={musclePath(selectedHistoryExercise.muscleId)}
          onBack={() => setPage('Exercises')}
        />}

        {page === 'Settings' && <section>
          <div className="eyebrow">YOUR PREFERENCES</div><h1>Settings</h1><p className="lead">Defaults keep new workouts quick to set up.</p>
          <div className="settings-card"><div className="settings-title"><div><h2>Default targets</h2><p>Used when a plan exercise has no custom target.</p></div><span className="settings-icon">◎</span></div><div className="settings-row"><label className="field">Default sets<input type="number" min="1" max="20" value={data.defaults.sets} onChange={(event) => setData((current) => ({ ...current, defaults: { ...current.defaults, sets: Math.max(1, Number(event.target.value) || 1) } }))} /></label><label className="field">Default reps<input type="number" min="1" max="100" value={data.defaults.reps} onChange={(event) => setData((current) => ({ ...current, defaults: { ...current.defaults, reps: Math.max(1, Number(event.target.value) || 1) } }))} /></label></div></div>
          <div className="settings-card"><div className="settings-title"><div><h2>Weight unit</h2><p>Logged weight is stored as entered with each set.</p></div><span className="settings-icon">↕</span></div><div className="unit-toggle"><button className={data.defaults.unit === 'kg' ? 'active' : ''} onClick={() => setData((current) => ({ ...current, defaults: { ...current.defaults, unit: 'kg' } }))}>Kilograms <span>kg</span></button><button className={data.defaults.unit === 'lb' ? 'active' : ''} onClick={() => setData((current) => ({ ...current, defaults: { ...current.defaults, unit: 'lb' } }))}>Pounds <span>lb</span></button></div></div>
          <div className="settings-card privacy-card"><div className="settings-title"><div><h2>Private by default</h2><p>Your plans, timers and workout history stay in this browser on this device.</p></div><span className="privacy-dot large-dot" /></div><p className="settings-note">If you clear this browser’s site data, your workout history will also be removed. Use the same browser to keep your data available.</p></div>
        </section>}
      </div>
    </main>

    {data.active && <div className="timer-scrim"><div className="timer-modal">
      <button className="modal-close" onClick={discardActive} aria-label="Close timer">×</button>
      <div className="eyebrow">{data.active.planName.toUpperCase()} · EXERCISE TIMER</div><h2>{data.active.exerciseName}</h2>
      <p className="timer-suggestion">Suggested <b>{data.active.suggestion.sets} sets × {data.active.suggestion.reps} reps</b><span> · Target {data.active.targetSets} × {data.active.targetReps}</span></p>
      <div className={`timer-face ${data.active.phase === 'rest' ? 'rest-face' : ''}`}><span>{data.active.phase === 'entry' ? 'SET TIME' : data.active.phase === 'rest' ? 'REST' : `SET ${data.active.sets.length + 1}`}</span><strong>{formatDuration(data.active.phase === 'work' ? secondsBetween(data.active.workStartedAt, now) : data.active.phase === 'rest' ? secondsBetween(data.active.restStartedAt, now) : data.active.pendingWorkSeconds)}</strong></div>
      {data.active.phase === 'entry' && <div className="set-entry"><div className="entry-duration">Set duration · {formatDuration(data.active.pendingWorkSeconds)}</div><div className="form-row"><label className="field">Reps<input type="number" min="0" value={data.active.entryReps} onChange={(event) => setData((current) => current.active ? { ...current, active: { ...current.active, entryReps: event.target.value } } : current)} /></label><label className="field">Weight ({data.defaults.unit})<input type="number" min="0" step="0.5" value={data.active.entryWeight} onChange={(event) => setData((current) => current.active ? { ...current, active: { ...current.active, entryWeight: event.target.value } } : current)} /></label></div><button className="button dark wide-button" onClick={saveSet}>Save set & start rest <span>→</span></button></div>}
      {data.active.phase === 'work' && <button className="button dark wide-button" onClick={stopSet}>Finish set <span>→</span></button>}
      {data.active.phase === 'rest' && <div className="rest-actions"><button className="button dark wide-button" onClick={resumeSet}>Resume · start next set <span>→</span></button><button className="text-button finish-link" onClick={finishExercise}>Finish exercise & save</button></div>}
      <div className="timer-set-list">{data.active.sets.map((set, index) => <div key={index}><span>SET {index + 1}</span><b>{set.reps} reps · {set.weight} {set.unit ?? data.defaults.unit}</b><small>{formatDuration(set.workSeconds)} work{set.restSeconds ? ` · ${formatDuration(set.restSeconds)} rest` : ''}</small></div>)}</div>
      <div className="timer-footer"><span className="privacy-dot" /> Session and elapsed times save on this device</div>
    </div></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>
}

function ExerciseProgress({ exercise, logs, unit, musclePath, onBack }: {
  exercise: Exercise; logs: ExerciseLog[]; unit: 'kg' | 'lb'; musclePath: string; onBack: () => void
}) {
  const [metric, setMetric] = useState<'weight' | 'reps' | 'volume'>('weight')
  const sessions = [...logs].sort((a, b) => a.startedAt - b.startedAt).map((log) => {
    const totalReps = log.sets.reduce((sum, set) => sum + set.reps, 0)
    const topWeight = log.sets.reduce((top, set) => Math.max(top, convertWeight(set.weight, set.unit ?? unit, unit)), 0)
    const volume = log.sets.reduce((sum, set) => sum + set.reps * convertWeight(set.weight, set.unit ?? unit, unit), 0)
    return { log, totalReps, topWeight, volume }
  })
  const values = sessions.map((session) => metric === 'weight' ? session.topWeight : metric === 'reps' ? session.totalReps : session.volume)
  const valueLabel = metric === 'weight' ? `Top set weight (${unit})` : metric === 'reps' ? 'Total reps' : `Training volume (${unit} × reps)`
  const formatValue = (value: number) => metric === 'weight' ? `${Number(value.toFixed(1))} ${unit}` : Math.round(value).toLocaleString()
  const firstValue = values[0] ?? 0
  const latestValue = values.at(-1) ?? 0
  const change = values.length > 1 ? latestValue - firstValue : null
  const changeLabel = change === null ? 'Need another session' : `${change > 0 ? '+' : ''}${formatValue(change)}`

  const width = 720, height = 300, left = 62, right = 25, top = 28, bottom = 48
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const spread = Math.max(...values, 0) - Math.min(...values, 0)
  const padding = spread ? spread * .16 : Math.max(Math.abs(latestValue) * .18, 1)
  const minValue = Math.max(0, Math.min(...values, 0) - padding)
  const maxValue = Math.max(...values, 0) + padding || 1
  const xFor = (index: number) => sessions.length < 2 ? left + plotWidth / 2 : left + index / (sessions.length - 1) * plotWidth
  const yFor = (value: number) => top + (maxValue - value) / (maxValue - minValue || 1) * plotHeight
  const points = values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ')
  const labelIndexes = new Set(sessions.length <= 4 ? sessions.map((_, index) => index) : [0, Math.floor((sessions.length - 1) / 2), sessions.length - 1])

  return <section className="exercise-progress">
    <button className="back-link" onClick={onBack}>← Exercise library</button>
    <div className="eyebrow">EXERCISE HISTORY / PROGRESS</div>
    <h1>{exercise.name}</h1>
    <p className="lead">{musclePath} · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} recorded</p>
    <div className="progress-summary-grid">
      <div className="progress-summary"><span>LAST SESSION</span><b>{sessions.length ? formatDay(sessions.at(-1)!.log.date) : '—'}</b><small>{sessions.length ? `${sessions.at(-1)!.log.sets.length} sets logged` : 'No sessions yet'}</small></div>
      <div className="progress-summary"><span>{metric === 'weight' ? 'LAST TOP WEIGHT' : metric === 'reps' ? 'LAST TOTAL REPS' : 'LAST SESSION VOLUME'}</span><b>{sessions.length ? formatValue(latestValue) : '—'}</b><small>{sessions.length ? 'most recent session' : 'Start a workout to track progress'}</small></div>
      <div className="progress-summary progress-summary-accent"><span>CHANGE SINCE FIRST</span><b>{changeLabel}</b><small>{change === null ? 'One more session unlocks a trend' : `${formatValue(firstValue)} → ${formatValue(latestValue)}`}</small></div>
    </div>
    <article className="progress-chart-card">
      <div className="progress-chart-heading"><div><div className="eyebrow">SESSION BY SESSION</div><h2>{valueLabel}</h2></div><div className="metric-switch" role="group" aria-label="Chart metric">{(['weight', 'reps', 'volume'] as const).map((option) => <button key={option} className={metric === option ? 'active' : ''} onClick={() => setMetric(option)}>{option === 'weight' ? 'Weight' : option === 'reps' ? 'Reps' : 'Volume'}</button>)}</div></div>
      {!sessions.length ? <div className="progress-empty"><span>↗</span><b>No history yet</b><p>Complete this exercise from a workout plan and the session will appear here.</p></div> : <div className="chart-scroll"><svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${valueLabel} across ${sessions.length} workout sessions`}>
        {[0, 1, 2, 3].map((step) => {
          const y = top + step / 3 * plotHeight
          const value = maxValue - step / 3 * (maxValue - minValue)
          return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} className="chart-gridline" /><text x={left - 11} y={y + 4} textAnchor="end" className="chart-axis-label">{formatValue(value)}</text></g>
        })}
        {sessions.length > 1 && <polyline points={points} className="chart-line" />}
        {sessions.map((session, index) => <g key={session.log.id}><circle cx={xFor(index)} cy={yFor(values[index])} r="5" className="chart-point"><title>{formatDay(session.log.date)}: {formatValue(values[index])}</title></circle>{labelIndexes.has(index) && <text x={xFor(index)} y={height - 15} textAnchor="middle" className="chart-axis-label">{formatDay(session.log.date)}</text>}</g>)}
      </svg></div>}
      {sessions.length === 1 && <div className="chart-hint">One session logged. Complete the exercise again to see a trend line.</div>}
    </article>
    {!!sessions.length && <div className="progress-session-list"><div className="section-label">SESSION DETAILS <span>Most recent first</span></div>{[...sessions].reverse().map(({ log }) => <article className="progress-session-row" key={log.id}><div><b>{formatDay(log.date)}</b><span>{log.planName}</span></div><div className="progress-set-summary">{log.sets.map((set, index) => <span key={`${log.id}-${index}`}>{set.reps} reps · {set.weight} {set.unit ?? unit}</span>)}</div><div className="progress-session-value">{log.sets.length} sets</div></article>)}</div>}
  </section>
}

function MuscleBranch({ muscle, all, counts, onDelete, depth }: { muscle: Muscle; all: Muscle[]; counts: Map<string, number>; onDelete: (id: string) => void; depth: number }) {
  const children = all.filter((item) => item.parentId === muscle.id)
  return <div className="tree-node"><div className="tree-row" style={{ paddingLeft: 18 + depth * 24 }}><span className={`tree-indicator ${depth === 0 ? 'root-indicator' : ''}`} />
    <div className="tree-name"><b>{muscle.name}</b>{muscle.id === 'body' && <span className="root-pill">ROOT</span>}</div><span className="tree-count">{counts.get(muscle.id) ?? 0} {(counts.get(muscle.id) ?? 0) === 1 ? 'exercise' : 'exercises'}</span>{muscle.id !== 'body' && <button className="icon-button tree-delete" aria-label={`Delete ${muscle.name}`} onClick={() => onDelete(muscle.id)}>×</button>}</div>
    {children.map((child) => <MuscleBranch key={child.id} muscle={child} all={all} counts={counts} onDelete={onDelete} depth={depth + 1} />)}
  </div>
}

function PlanCard({ plan, exercises, muscles, defaults, onEdit, onDelete, onToggle, onTarget }: {
  plan: Plan; exercises: Exercise[]; muscles: Muscle[]; defaults: AppData['defaults']; onEdit: (plan: Plan) => void; onDelete: (id: string) => void
  onToggle: (plan: Plan, exerciseId: string) => void; onTarget: (plan: Plan, exerciseId: string, field: 'sets' | 'reps', value: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const musclePath = (id: string) => {
    const names: string[] = []; let current = muscles.find((muscle) => muscle.id === id)
    while (current) { names.unshift(current.name); current = current.parentId ? muscles.find((muscle) => muscle.id === current!.parentId) : undefined }
    return names.join(' / ')
  }
  return <article className="plan-card"><div className="plan-card-head"><div className="plan-day"><span>{plan.weekday === null ? '—' : weekdays[plan.weekday].slice(0, 3).toUpperCase()}</span></div><div className="plan-card-title"><h2>{plan.name}</h2><span>{plan.weekday === null ? 'Archived · no weekday' : weekdays[plan.weekday]} · {plan.exercises.length} {plan.exercises.length === 1 ? 'exercise' : 'exercises'}</span></div><button className="text-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Done' : 'Exercises'} <span>{expanded ? '↑' : '↓'}</span></button><button className="text-button" onClick={() => onEdit(plan)}>Edit</button><button className="icon-button" aria-label={`Delete ${plan.name}`} onClick={() => onDelete(plan.id)}>×</button></div>
    {expanded && <div className="plan-exercise-editor"><div className="section-label">SELECT EXERCISES <span>Defaults: {defaults.sets} sets × {defaults.reps} reps</span></div>{!exercises.length && <div className="small-muted">Add exercises to your library first.</div>}{exercises.map((exercise) => {
      const selected = plan.exercises.some((item) => item.exerciseId === exercise.id)
      const target = plan.exercises.find((item) => item.exerciseId === exercise.id)
      return <div className={`plan-exercise-row ${selected ? 'checked' : ''}`} key={exercise.id}><label className="exercise-check"><input type="checkbox" checked={selected} onChange={() => onToggle(plan, exercise.id)} /><span className="custom-check">✓</span><div><b>{exercise.name}</b><small>{musclePath(exercise.muscleId)}</small></div></label>{selected && <div className="target-inputs"><label>Sets<input aria-label={`${exercise.name} sets override`} placeholder={String(defaults.sets)} type="number" min="1" value={target?.sets ?? ''} onChange={(event) => onTarget(plan, exercise.id, 'sets', event.target.value)} /></label><label>Reps<input aria-label={`${exercise.name} reps override`} placeholder={String(defaults.reps)} type="number" min="1" value={target?.reps ?? ''} onChange={(event) => onTarget(plan, exercise.id, 'reps', event.target.value)} /></label><span className="inherit-note">Blank uses defaults</span></div>}</div>
    })}</div>}
  </article>
}

export default App
