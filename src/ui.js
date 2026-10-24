export class UI {
  constructor() {
    this.boot = document.getElementById("boot");
    this.menu = document.getElementById("menu");
    this.hud = document.getElementById("hud");
    this.objective = document.getElementById("objective");
    this.objectiveText = document.getElementById("objective-text");
    this.timerWrap = document.getElementById("timer-wrap");
    this.timer = document.getElementById("timer");
    this.staminaWrap = document.getElementById("stamina-wrap");
    this.staminaBar = document.getElementById("stamina-bar");
    this.interaction = document.getElementById("interaction");
    this.interactionText = document.getElementById("interaction-text");
    this.subtitle = document.getElementById("subtitle");
    this.toast = document.getElementById("toast");
    this.fade = document.getElementById("fade");
    this.titleCard = document.getElementById("title-card");
    this.skipIntro = document.getElementById("skip-intro");
    this.lockHint = document.getElementById("lock-hint");
    this.pause = document.getElementById("pause");
    this.fail = document.getElementById("fail");
    this.ending = document.getElementById("ending");
    this.panelControls = document.getElementById("panel-controls");
    this.panelSettings = document.getElementById("panel-settings");
    this.document = document.getElementById("document");
    this.docKicker = document.getElementById("doc-kicker");
    this.docTitle = document.getElementById("doc-title");
    this.docBody = document.getElementById("doc-body");
    this.dangerFlash = document.getElementById("danger-flash");
    this.chapterNote = document.getElementById("chapter-note");
    this.endingLine1 = document.getElementById("ending-line-1");
    this.endingLine2 = document.getElementById("ending-line-2");
    this.endingChapter = document.getElementById("ending-chapter");
    this.endingActions = document.getElementById("ending-actions");
    this.subtitleTimer = null;
    this.toastTimer = null;
    this.docTimers = [];
    this.lastTimer = "";
    this.docOpen = false;
    this.fadeTransition = 900;
  }

  hideBoot() {
    this.boot.style.opacity = "0";
    setTimeout(() => this.boot.classList.add("hidden"), 720);
  }

  showMenu() {
    this.menu.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.fail.classList.add("hidden");
    this.ending.classList.add("hidden");
    this.ending.classList.remove("visible");
    this.titleCard.classList.remove("visible");
    this.document.classList.add("hidden");
    this.docOpen = false;
    this.hideInteraction();
    this.hideSubtitle();
    this.hideToast();
    this.setDanger(0);
  }

  hideMenu() {
    this.menu.classList.add("hidden");
  }

  showHUD() {
    this.hud.classList.remove("hidden");
  }

  hideHUD() {
    this.hud.classList.add("hidden");
    this.hideInteraction();
  }

  showIntroHud() {
    this.showHUD();
    this.objective.classList.add("hidden");
    this.timerWrap.classList.add("hidden");
    this.staminaWrap.classList.add("hidden");
    this.lockHint.classList.add("hidden");
  }

  showGameplayHud() {
    this.showHUD();
    this.objective.classList.remove("hidden");
    this.staminaWrap.classList.remove("hidden");
    this.lockHint.classList.add("hidden");
    this.hideInteraction();
  }

  setObjective(text, pulse = false) {
    if (this.objectiveText.textContent === text && !pulse) return;
    this.objectiveText.textContent = text;
    if (pulse) {
      this.objective.classList.remove("pulse");
      void this.objective.offsetWidth;
      this.objective.classList.add("pulse");
      setTimeout(() => this.objective.classList.remove("pulse"), 1200);
    }
  }

  setTimerVisible(visible) {
    this.timerWrap.classList.toggle("hidden", !visible);
  }

  setTimer(text, glitch = false) {
    if (text !== this.lastTimer) {
      this.timer.textContent = text;
      this.lastTimer = text;
    }
    this.timerWrap.classList.toggle("glitch", glitch);
  }

  setStamina(ratio, exhausted = false) {
    this.staminaBar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
    this.staminaWrap.classList.toggle("exhausted", exhausted);
    this.staminaWrap.style.opacity = ratio < 0.999 || exhausted ? "1" : "0.55";
  }

  showInteraction(text) {
    if (this.interactionText.textContent !== text) this.interactionText.textContent = text;
    if (this.interaction.classList.contains("hidden")) {
      this.interaction.classList.remove("hidden");
    }
  }

  hideInteraction() {
    this.interaction.classList.add("hidden");
  }

  showSubtitle(text, duration = 3000, speaker = null) {
    clearTimeout(this.subtitleTimer);
    this.subtitle.replaceChildren();
    if (speaker) {
      const label = document.createElement("span");
      label.className = "speaker";
      label.textContent = speaker;
      this.subtitle.append(label);
    }
    const line = document.createElement("span");
    line.textContent = text;
    this.subtitle.append(line);
    this.subtitle.classList.remove("hidden");
    requestAnimationFrame(() => this.subtitle.classList.add("visible"));
    this.subtitleTimer = setTimeout(() => this.hideSubtitle(), duration);
  }

  hideSubtitle() {
    clearTimeout(this.subtitleTimer);
    this.subtitle.classList.remove("visible");
    setTimeout(() => {
      if (!this.subtitle.classList.contains("visible")) this.subtitle.classList.add("hidden");
    }, 380);
  }

  showToast(text, duration = 2800) {
    clearTimeout(this.toastTimer);
    this.toast.textContent = text;
    this.toast.classList.remove("hidden");
    this.toastTimer = setTimeout(() => this.hideToast(), duration);
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.toast.classList.add("hidden");
  }

  showTitleCard() {
    this.titleCard.classList.remove("hidden");
    requestAnimationFrame(() => this.titleCard.classList.add("visible"));
  }

  hideTitleCard() {
    this.titleCard.classList.remove("visible");
    setTimeout(() => this.titleCard.classList.add("hidden"), 1600);
  }

  showSkipIntro() {
    this.skipIntro.classList.remove("hidden");
  }

  hideSkipIntro() {
    this.skipIntro.classList.add("hidden");
  }

  showLockHint() {
    this.lockHint.classList.remove("hidden");
  }

  hideLockHint() {
    this.lockHint.classList.add("hidden");
  }

  showChapterNote(text) {
    this.chapterNote.textContent = text;
    this.chapterNote.classList.remove("hidden");
  }

  hideChapterNote() {
    this.chapterNote.classList.add("hidden");
  }

  setDanger(value) {
    this.dangerFlash.style.opacity = String(Math.max(0, Math.min(1, value)));
  }

  fadeTo(opacity, duration = 900) {
    this.fade.style.transitionDuration = `${duration}ms`;
    this.fade.style.opacity = String(opacity);
  }

  showPause() {
    this.pause.classList.remove("hidden");
    this.hideLockHint();
    this.hideInteraction();
  }

  hidePause() {
    this.pause.classList.add("hidden");
  }

  showFail() {
    this.fail.classList.remove("hidden");
    this.setDanger(0);
    this.hideInteraction();
    this.hideLockHint();
  }

  hideFail() {
    this.fail.classList.add("hidden");
  }

  showPanel(id) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.remove("hidden");
  }

  hidePanel(id) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.add("hidden");
  }

  hidePanels() {
    this.hidePanel("panel-controls");
    this.hidePanel("panel-settings");
  }

  anyPanelOpen() {
    return !this.panelControls.classList.contains("hidden") || !this.panelSettings.classList.contains("hidden");
  }

  openDocument(kicker, title, lines, { staged = false } = {}) {
    for (const timer of this.docTimers) clearTimeout(timer);
    this.docTimers = [];
    this.docKicker.textContent = kicker;
    this.docTitle.textContent = title;
    this.docBody.replaceChildren();
    const paragraphs = lines.map((line) => {
      const p = document.createElement("p");
      if (typeof line === "string") {
        p.textContent = line;
      } else {
        p.textContent = line.text;
        if (line.className) p.className = line.className;
      }
      this.docBody.append(p);
      return p;
    });
    this.document.classList.remove("hidden");
    this.docOpen = true;
    if (staged) {
      let delay = 250;
      paragraphs.forEach((p, index) => {
        const timer = setTimeout(() => p.classList.add("visible"), delay);
        this.docTimers.push(timer);
        const source = lines[index];
        delay += source?.delay ?? 1100;
      });
    } else {
      paragraphs.forEach((p) => p.classList.add("visible"));
    }
  }

  closeDocument() {
    for (const timer of this.docTimers) clearTimeout(timer);
    this.docTimers = [];
    this.document.classList.add("hidden");
    this.docOpen = false;
  }

  beginEnding() {
    this.hud.classList.add("hidden");
    this.ending.classList.remove("hidden");
    void this.ending.offsetWidth;
    this.ending.classList.add("visible");
    this.endingLine1.classList.remove("visible");
    this.endingLine2.classList.remove("visible");
    this.endingChapter.classList.add("hidden");
    this.endingChapter.classList.remove("visible");
    this.endingActions.classList.add("hidden");
    this.endingActions.classList.remove("visible");
  }

  revealEndingLines() {
    this.endingLine1.classList.add("visible");
    setTimeout(() => this.endingLine2.classList.add("visible"), 2600);
  }

  revealChapter() {
    this.endingChapter.classList.remove("hidden");
    requestAnimationFrame(() => this.endingChapter.classList.add("visible"));
  }

  revealEndingActions() {
    this.endingActions.classList.remove("hidden");
    requestAnimationFrame(() => this.endingActions.classList.add("visible"));
  }
}
