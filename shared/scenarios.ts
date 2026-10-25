import type { Scenario } from './domain.js';

export const referenceImageNote = 'Provided reference image; not vehicle-specific camera footage. No pixels were analyzed by the fleet monitor.';

export const scenarios: Record<Scenario['id'], Scenario> = {
  'Q-2048': {
    id: 'Q-2048', agent: 'Quality Live Agent', vehicle: 'EVS Demo Vehicle', plant: 'Factory 56 Demo',
    line: 'Door Assembly Line A', station: 'Station 42', component: 'Front-left door and upper hinge', componentType: 'door-hinge',
    symptom: 'Several vehicles require unusually high force to close the front-left door.', count: 18,
    firstObserved: '14:32', event: { id: 'TC-4412', at: '14:05', description: 'Hinge-tool calibration completed at Station 42' },
    historical: {
      id: 'QI-1847', description: 'Similar closing-force symptoms after hinge-tool calibration.',
      procedure: ['Inspect upper and lower hinge alignment.', 'Verify the active calibration profile against the approved baseline.',
        'Recalibrate only if measured values exceed tolerance and an engineer authorizes the change.',
        'Inspect and measure the next five vehicles.', 'Maintain quality hold until an authorized engineer approves release.'],
    },
    measurements: { baseline: 38, limit: 50, limitDirection: 'upper', unit: 'N', values: [37, 39, 38, 40, 62, 68, 71, 66],
      times: ['14:00', '14:08', '14:16', '14:24', '14:32', '14:40', '14:48', '14:56'],
      firstObserved: '14:32', observation: 'Closing force exceeds the synthetic 50 N upper limit beginning at 14:32.' },
    visual: 'Possible alignment inconsistency near the upper hinge area.', region: 'upper hinge area',
    probableCause: 'Potential hinge-tool calibration deviation following TC-4412.',
    action: 'Inspect Station 42 hinge alignment, verify the calibration profile, recalibrate if authorized and necessary, and validate the next five vehicles.',
    actionId: 'CA-1041', sample: '/reference-images/door-hinge.png',
  },
  'Q-3012': {
    id: 'Q-3012', agent: 'Production Support Assistant', vehicle: 'Sedan Demo Vehicle', plant: 'Bremen Demo Plant',
    line: 'Paint Line B', station: 'Paint Booth 7', component: 'Painted exterior panel', componentType: 'paint',
    symptom: 'Paint thickness below synthetic specification.', count: 31,
    firstObserved: '09:47', event: { id: 'NM-901', at: '09:20', description: 'Spray-nozzle maintenance completed at Paint Booth 7' },
    historical: { id: 'QI-1772', description: 'Low coating thickness following nozzle maintenance.',
      procedure: ['Inspect coating with an approved measurement system.', 'Verify nozzle pressure against the approved configuration.',
        'Recalibrate only with engineer authorization.', 'Measure the next five vehicles.', 'Require engineer approval before release.'] },
    measurements: { baseline: 110, limit: 90, limitDirection: 'lower', unit: 'micrometers', values: [108, 112, 110, 107, 81, 76, 78, 80],
      times: ['09:15', '09:23', '09:31', '09:39', '09:47', '09:55', '10:03', '10:11'],
      firstObserved: '09:47', observation: 'Paint thickness falls below the synthetic 90 micrometer lower limit beginning at 09:47.' },
    visual: 'Possible uneven coating appearance; thickness cannot be established from this image.', region: 'panel surface',
    probableCause: 'Potential incorrect nozzle pressure following maintenance NM-901.',
    action: 'Verify nozzle pressure against the approved configuration, recalibrate if authorized and required, and inspect the next five vehicles.',
    actionId: 'CA-1042', sample: '/reference-images/paint-panel.png',
  },
  'Q-2049': {
    id: 'Q-2049', agent: 'Quality Live Agent', vehicle: 'Sedan Demo Vehicle', plant: 'Factory 56 Demo',
    line: 'Door Assembly Line A', station: 'Station 43', component: 'Front-left door latch and striker', componentType: 'door-latch',
    symptom: 'The front-left door catches at the latch and needs extra closing force.', count: 12,
    firstObserved: '11:24', event: { id: 'SF-4308', at: '11:05', description: 'Striker-positioning fixture changeover completed at Station 43' },
    historical: { id: 'QI-1926', description: 'Latch interference after a striker-positioning fixture changeover.',
      procedure: ['Inspect latch engagement and striker witness marks.', 'Measure striker position against the approved datum and verify fixture seating.',
        'Adjust the fixture or striker only after measured deviation and engineer authorization.',
        'Measure closing force and latch engagement on the next five vehicles.', 'Require engineer approval before any hold or release change.'] },
    measurements: { baseline: 36, limit: 50, limitDirection: 'upper', unit: 'N', values: [35, 37, 36, 38, 57, 61, 63, 60],
      times: ['10:52', '11:00', '11:08', '11:16', '11:24', '11:32', '11:40', '11:48'],
      firstObserved: '11:24', observation: 'Latch closing force exceeds the synthetic 50 N upper limit beginning at 11:24.' },
    visual: 'Possible contact marks near the striker; engagement and position require measurement.', region: 'door latch and striker',
    probableCause: 'Potential striker-positioning fixture seating deviation following changeover SF-4308.',
    action: 'Inspect latch engagement, measure striker position and fixture seating, request engineer-authorized adjustment only if required, and validate the next five vehicles.',
    actionId: 'CA-1043', sample: '/reference-images/door-trim.jpg',
  },
  'Q-2050': {
    id: 'Q-2050', agent: 'Quality Live Agent', vehicle: 'SUV Demo Vehicle', plant: 'Sindelfingen Demo Plant',
    line: 'Closure Assembly Line C', station: 'Station 58', component: 'Tailgate and rear body panel gap', componentType: 'tailgate',
    symptom: 'The tailgate-to-body panel gap is wider than expected on several vehicles.', count: 9,
    firstObserved: '16:18', event: { id: 'TF-5803', at: '15:55', description: 'Tailgate locating-fixture insert replacement completed at Station 58' },
    historical: { id: 'QI-2013', description: 'Tailgate panel-gap deviation after locating-fixture insert replacement.',
      procedure: ['Measure tailgate-to-body gaps and flushness using the approved gauge.', 'Verify locating-fixture insert seating and the approved setup datum.',
        'Correct the fixture setup only after engineer authorization and measured confirmation.',
        'Inspect gaps, flushness and closure function on the next five vehicles.', 'Require engineer approval before any hold or release change.'] },
    measurements: { baseline: 3.5, limit: 4.5, limitDirection: 'upper', unit: 'mm', values: [3.4, 3.6, 3.5, 3.7, 5.2, 5.8, 6.1, 5.6],
      times: ['15:46', '15:54', '16:02', '16:10', '16:18', '16:26', '16:34', '16:42'],
      firstObserved: '16:18', observation: 'Tailgate panel gap exceeds the synthetic 4.5 mm upper limit beginning at 16:18.' },
    visual: 'Possible uneven tailgate-to-body gap; actual dimensions and flushness require an approved gauge.', region: 'tailgate-to-body panel gap',
    probableCause: 'Potential locating-fixture insert seating deviation following replacement TF-5803.',
    action: 'Measure tailgate gaps and flushness, verify fixture insert seating and datum, request engineer-authorized correction only if required, and validate the next five vehicles.',
    actionId: 'CA-1044', sample: '/reference-images/tailgate-gap.png',
  },
};

const normalizeScope = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export function scenarioForStation(station: string): Scenario | undefined {
  const normalized = normalizeScope(station);
  return Object.values(scenarios).find(scenario => normalizeScope(scenario.station) === normalized ||
    (/^\d+$/.test(normalized) && normalizeScope(scenario.station) === `station${normalized}`));
}
export function compatibleComponent(component: string, scenario: Scenario): boolean {
  if (normalizeScope(component) === normalizeScope(scenario.component)) return true;
  switch (scenario.componentType) {
    case 'door-hinge': return /\b(door|hinge)\b/i.test(component) && !/\b(rear|right|tailgate|latch|striker|paint)\b/i.test(component);
    case 'door-latch': return /\b(door|latch|striker)\b/i.test(component) && !/\b(rear|right|tailgate|hinge|paint)\b/i.test(component);
    case 'paint': return /\b(paint(?:ed)?|coating|coat)\b/i.test(component) && !/\b(hinge|latch|striker)\b/i.test(component);
    case 'tailgate': return /\b(tailgate|liftgate|rear hatch)\b/i.test(component) && !/\b(paint(?:ed)?|coating|front)\b/i.test(component);
  }
}
