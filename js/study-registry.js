/**
 * StudyRegistry - AmiBroker Deterministic Study & Chart ID Mapping
 */
export class StudyRegistry {
  constructor() {
    this.studies = new Map();
    this.drawings = new Map();
  }

  registerStudy(chartId, studyConfig) {
    if (!this.studies.has(chartId)) {
      this.studies.set(chartId, []);
    }
    this.studies.get(chartId).push(studyConfig);
    console.log(`[StudyRegistry] Registered study ${studyConfig.name} to Chart ID ${chartId}`);
  }

  getStudiesForChart(chartId) {
    return this.studies.get(chartId) || [];
  }

  addDrawing(chartId, drawingObj) {
    if (!this.drawings.has(chartId)) {
      this.drawings.set(chartId, []);
    }
    this.drawings.get(chartId).push(drawingObj);
  }

  getDrawingsForChart(chartId) {
    return this.drawings.get(chartId) || [];
  }
}