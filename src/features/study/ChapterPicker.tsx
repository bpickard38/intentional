import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type ChapterPickerProps = {
  selected: string[];
  onChangeSelected: (next: string[]) => void;
  onGenerate: () => void;
  generating?: boolean;
};

type StandardWorkId = "OT" | "NT" | "BOM" | "DNC" | "PGP";

type BookMeta = {
  id: string;
  title: string;
  chapters: number;
};

const STANDARD_WORKS: { id: StandardWorkId; label: string }[] = [
  { id: "OT", label: "Old Testament" },
  { id: "NT", label: "New Testament" },
  { id: "BOM", label: "Book of Mormon" },
  { id: "DNC", label: "Doctrine & Covenants" },
  { id: "PGP", label: "Pearl of Great Price" },
];

// Trimmed starter set; safe to extend without changing behavior.
const BOOKS_BY_WORK: Record<StandardWorkId, BookMeta[]> = {
  OT: [
    { id: "Genesis", title: "Genesis", chapters: 50 },
    { id: "Exodus", title: "Exodus", chapters: 40 },
    { id: "Psalms", title: "Psalms", chapters: 150 },
    { id: "Isaiah", title: "Isaiah", chapters: 66 },
  ],
  NT: [
    { id: "Matthew", title: "Matthew", chapters: 28 },
    { id: "Mark", title: "Mark", chapters: 16 },
    { id: "Luke", title: "Luke", chapters: 24 },
    { id: "John", title: "John", chapters: 21 },
    { id: "Acts", title: "Acts", chapters: 28 },
    { id: "Romans", title: "Romans", chapters: 16 },
  ],
  BOM: [
    { id: "1 Nephi", title: "1 Nephi", chapters: 22 },
    { id: "2 Nephi", title: "2 Nephi", chapters: 33 },
    { id: "Jacob", title: "Jacob", chapters: 7 },
    { id: "Mosiah", title: "Mosiah", chapters: 29 },
    { id: "Alma", title: "Alma", chapters: 63 },
    { id: "Helaman", title: "Helaman", chapters: 16 },
    { id: "3 Nephi", title: "3 Nephi", chapters: 30 },
    { id: "Ether", title: "Ether", chapters: 15 },
    { id: "Moroni", title: "Moroni", chapters: 10 },
  ],
  DNC: [
    { id: "Doctrine and Covenants", title: "Doctrine and Covenants", chapters: 138 },
  ],
  PGP: [
    { id: "Moses", title: "Moses", chapters: 8 },
    { id: "Abraham", title: "Abraham", chapters: 5 },
    { id: "Joseph Smith—History", title: "Joseph Smith—History", chapters: 1 },
  ],
};

export function ChapterPicker({
  selected,
  onChangeSelected,
  onGenerate,
  generating,
}: ChapterPickerProps) {
  const [workId, setWorkId] = useState<StandardWorkId>("NT");
  const [search, setSearch] = useState("");

  const books = BOOKS_BY_WORK[workId];

  const filteredBooks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return books;
    return books.filter((b) => b.title.toLowerCase().includes(term));
  }, [books, search]);

  const toggleChapter = (book: BookMeta, chapter: number) => {
    const ref = `${book.title} ${chapter}`;
    if (selected.includes(ref)) {
      onChangeSelected(selected.filter((r) => r !== ref));
    } else {
      onChangeSelected([...selected, ref]);
    }
  };

  const clearAll = () => {
    onChangeSelected([]);
  };

  return (
    <View>
      <Text style={styles.label}>Standard works</Text>
      <View style={styles.workRow}>
        {STANDARD_WORKS.map((w) => (
          <Pressable
            key={w.id}
            onPress={() => setWorkId(w.id)}
            style={[styles.workBtn, workId === w.id && styles.workBtnActive]}
          >
            <Text
              style={[
                styles.workBtnText,
                workId === w.id && styles.workBtnTextActive,
              ]}
            >
              {w.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Search book (e.g. John, Mosiah)…"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filteredBooks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const chapters = Array.from({ length: item.chapters }, (_, i) => i + 1);
          return (
            <View style={styles.bookRow}>
              <Text style={styles.bookTitle}>{item.title}</Text>
              <View style={styles.chaptersRow}>
                {chapters.map((c) => {
                  const ref = `${item.title} ${c}`;
                  const active = selected.includes(ref);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => toggleChapter(item, c)}
                      style={[
                        styles.chapterChip,
                        active && styles.chapterChipActive,
                      ]}
                    >
                      <Text
                        style={
                          active
                            ? styles.chapterChipTextActive
                            : styles.chapterChipText
                        }
                      >
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
        style={styles.bookList}
      />

      <View style={styles.selectedRow}>
        <Text style={styles.selectedLabel}>Selected chapters</Text>
        {selected.length > 0 && (
          <Pressable onPress={clearAll}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.selectedChipsRow}>
        {selected.map((ref) => (
          <Pressable
            key={ref}
            onPress={() =>
              onChangeSelected(selected.filter((r) => r !== ref))
            }
            style={styles.selectedChip}
          >
            <Text style={styles.selectedChipText}>{ref} ✕</Text>
          </Pressable>
        ))}
        {selected.length === 0 && (
          <Text style={styles.helperText}>
            Tap chapters above to add them here.
          </Text>
        )}
      </View>

      <Pressable
        onPress={onGenerate}
        disabled={generating || selected.length === 0}
        style={[
          styles.generateBtn,
          (generating || selected.length === 0) && styles.generateBtnDisabled,
        ]}
      >
        <Text style={styles.generateBtnText}>
          {generating ? "Generating…" : "Generate Study Helps"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  workRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  workBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  workBtnActive: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e8f4f8",
  },
  workBtnText: { fontSize: 13 },
  workBtnTextActive: { fontSize: 13, fontWeight: "700", color: "#0a7ea4" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  bookList: { maxHeight: 260, marginBottom: 12 },
  bookRow: { marginBottom: 8 },
  bookTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  chaptersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chapterChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chapterChipActive: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e8f4f8",
  },
  chapterChipText: { fontSize: 12 },
  chapterChipTextActive: { fontSize: 12, fontWeight: "700", color: "#0a7ea4" },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  selectedLabel: { fontSize: 14, fontWeight: "600" },
  clearText: { fontSize: 12, color: "#b02a37", fontWeight: "600" },
  selectedChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  selectedChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e8f4f8",
  },
  selectedChipText: {
    fontSize: 13,
    color: "#0a7ea4",
    fontWeight: "600",
  },
  helperText: { fontSize: 12, color: "#666" },
  generateBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  generateBtnDisabled: {
    backgroundColor: "#9ac7da",
  },
  generateBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

