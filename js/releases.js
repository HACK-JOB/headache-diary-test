// Published patch notes. Written by scripts/publish-notes.mjs; do not edit by hand.
export const RELEASES = [
  {
    "id": 1,
    "date": "2026-10-09",
    "title": "Update 1",
    "notes": [
      {
        "screen": "main",
        "text": "New: this What's new card. It appears only on screens that changed. Got it hides it, and Tester notes keeps a Past updates list."
      },
      {
        "screen": "main",
        "text": "Text sizes are now Biggest, Medium and Small."
      },
      {
        "screen": "main",
        "text": "Water sits on the left, with Headache, Day and Blood glucose on the right. Weight and Medicines run underneath."
      },
      {
        "screen": "intake",
        "text": "A Most used row of five foods sits above the meal choices."
      },
      {
        "screen": "intake",
        "text": "Nutrition can be entered per serving or per 100 g. Per 100 g asks for the grams in one serving."
      },
      {
        "screen": "intake",
        "text": "Scan a barcode fills in the name and nutrition from the pack. It also reads the printed number to check the two match, where it can."
      },
      {
        "screen": "intake",
        "text": "If only the barcode or only the number can be read, a note asks for a check that the product matches the pack."
      },
      {
        "screen": "admin",
        "text": "Admin now has side tabs: Diary screens, Doctor accounts, Admin PIN and Reset data."
      },
      {
        "screen": "admin-reset",
        "text": "Water, meals, headaches, saved foods, readings and other data can now be reset one kind at a time. Each asks for DELETE."
      },
      {
        "screen": "doctors",
        "text": "Doctors now has side tabs for people, targets, medicines, relief, clinical notes and the change log."
      },
      {
        "screen": "tester",
        "text": "Tester notes has a checklist, a comment box, and steps for Share and Save as file. All notes stay on the tablet."
      }
    ]
  }
];
