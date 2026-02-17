func renderDiff(p model.ProjectOutput, title string) {
	statsBuf.SetText("")
	statsBuf.InsertWithTag(statsBuf.GetEndIter(), fmt.Sprintf("=== %s ===\n\n", strings.ToUpper(title)), getTag("header"))

	if p.ProjectTree != "" {
		statsBuf.Insert(statsBuf.GetEndIter(), "PROJECT STRUCTURE:\n")
		statsBuf.Insert(statsBuf.GetEndIter(), p.ProjectTree+"\n")
		statsBuf.Insert(statsBuf.GetEndIter(), "---\n\n")
	}

	var keys []string
	for k := range p.Files {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// 1. Show a complete list of affected files first
	statsBuf.InsertWithTag(statsBuf.GetEndIter(), "AFFECTED FILES:\n", getTag("header"))
	for _, path := range keys {
		statsBuf.Insert(statsBuf.GetEndIter(), fmt.Sprintf(" • %s\n", path))
	}
	statsBuf.Insert(statsBuf.GetEndIter(), "\n---\n\n")

	dmp := diffmatchpatch.New()
	renderCount := 0
	const limit = 10

	for _, path := range keys {
		if renderCount >= limit {
			break
		}
		newContent := p.Files[path]
		if !utf8.ValidString(newContent) {
			continue
		}

		statsBuf.InsertWithTag(statsBuf.GetEndIter(), fmt.Sprintf("FILE CONTENT/DIFF: %s\n", path), getTag("header"))

		old, _ := os.ReadFile(path)
		oldStr := string(old)
		if !utf8.ValidString(oldStr) {
			oldStr = ""
		}

		// Use (old, new) order so Insert/Delete colors make sense
		diffs := dmp.DiffMain(oldStr, newContent, true)
		diffs = dmp.DiffCleanupSemantic(diffs)

		if len(diffs) == 1 && diffs[0].Type == diffmatchpatch.DiffEqual {
			statsBuf.Insert(statsBuf.GetEndIter(), newContent+"\n\n")
		} else {
			for _, d := range diffs {
				if utf8.ValidString(d.Text) {
					switch d.Type {
					case diffmatchpatch.DiffInsert:
						statsBuf.InsertWithTag(statsBuf.GetEndIter(), d.Text, getTag("added"))
					case diffmatchpatch.DiffDelete:
						statsBuf.InsertWithTag(statsBuf.GetEndIter(), d.Text, getTag("deleted"))
					default:
						statsBuf.Insert(statsBuf.GetEndIter(), d.Text)
					}
				}
			}
			statsBuf.Insert(statsBuf.GetEndIter(), "\n\n")
		}
		renderCount++
	}

	if len(keys) > limit {
		msg := fmt.Sprintf("--- PREVIEW LIMIT REACHED: %d/%d diffs shown. See file list above for full scope. ---", limit, len(keys))
		statsBuf.InsertWithTag(statsBuf.GetEndIter(), msg, getTag("header"))
	}
}