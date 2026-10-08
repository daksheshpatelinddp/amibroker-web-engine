export class StudyRegistry {
  constructor() {
    this.studies = new Map();
  }

  registerStudy(id, name, type) {
    this.studies.set(id, { id, name, type });
  }

  getStudy(id) {
    return this.studies.get(id);
  }
}