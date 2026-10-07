// js/study-registry.js

export class StudyRegistry {
  constructor() {
    this.registry = new Map();
  }

  registerStudy(studyId, sheetId, paneId, meta = {}) {
    const studyRecord = {
      studyId, sheetId, paneId, timestamp: Date.now(), ...meta,
    };
    this.registry.set(studyId, studyRecord);
    return studyRecord;
  }

  getStudy(studyId) {
    return this.registry.get(studyId);
  }
}