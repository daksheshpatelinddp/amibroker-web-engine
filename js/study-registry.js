// js/study-registry.js

export class StudyRegistry {
  constructor() {
    this.registry = new Map(); // studyId -> { sheetId, paneId, formulaCode, data }
  }

  registerStudy(studyId, sheetId, paneId, meta = {}) {
    const studyRecord = {
      studyId,
      sheetId,
      paneId,
      timestamp: Date.now(),
      ...meta,
    };
    this.registry.set(studyId, studyRecord);
    return studyRecord;
  }

  getStudy(studyId) {
    return this.registry.get(studyId);
  }

  // Returns all study streams associated with a specific sheet/pane for Backtester / Scanner
  getStudiesForPane(sheetId, paneId) {
    const matches = [];
    this.registry.forEach(record => {
      if (record.sheetId === sheetId && record.paneId === paneId) {
        matches.push(record);
      }
    });
    return matches;
  }
}