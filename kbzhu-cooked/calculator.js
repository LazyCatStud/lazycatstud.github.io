(function (root) {
  'use strict';

  var nutrientKeys = ['calories', 'protein', 'fat', 'carbs'];
  var inputIds = nutrientKeys.concat(['raw-weight', 'cooked-weight', 'portion-weight']);
  var presets = {
    pasta: [350, 12.5, 1.5, 72, 100, 250],
    rice: [340, 7, 1, 76, 100, 300],
    buckwheat: [330, 12, 3, 63, 100, 280]
  };

  function parseDecimal(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    var text = value.trim();
    if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
    var number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function bounded(value, max, positive) {
    var number = parseDecimal(value);
    if (number === null || number < 0 || (positive && number === 0) || number > max) {
      throw new RangeError('Проверьте значение: нужен допустимый положительный вес или неотрицательное КБЖУ.');
    }
    return number;
  }

  function calculateNutrition(input) {
    input = input || {};
    var raw = bounded(input.rawWeight, 10000000, true);
    var cooked = bounded(input.cookedWeight, 10000000, true);
    var portionWeight = input.portionWeight === null ? null : bounded(input.portionWeight === undefined ? 100 : input.portionWeight, 10000000, true);
    var factor = cooked / raw;
    var ratio = raw / cooked;
    if (!Number.isFinite(factor) || !Number.isFinite(ratio)) throw new RangeError('Слишком большая разница весов.');
    var result = { per100: {}, total: {}, portion: portionWeight === null ? null : {}, factor: factor, rawWeight: raw, cookedWeight: cooked, portionWeight: portionWeight };
    nutrientKeys.forEach(function (key) {
      var source = bounded(input[key], 100000, false);
      var per100 = source * ratio;
      var total = source * (raw / 100);
      var portion = portionWeight === null ? null : per100 * (portionWeight / 100);
      if (!Number.isFinite(per100) || !Number.isFinite(total) || (portion !== null && !Number.isFinite(portion))) throw new RangeError('Результат слишком велик. Проверьте веса.');
      result.per100[key] = per100;
      result.total[key] = total;
      if (result.portion) result.portion[key] = portion;
    });
    return result;
  }

  function formatNumber(number) {
    if (!Number.isFinite(number)) return '—';
    if (number !== 0 && Math.abs(number) < 0.001) return '< 0,001';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: number !== 0 && Math.abs(number) < 0.1 ? 3 : 1 }).format(number);
  }

  function initialize() {
    var form = document.getElementById('calculator-form');
    if (!form) return;
    var inputs = {};
    inputIds.forEach(function (id) { inputs[id] = document.getElementById(id); });
    var touched = {};
    var submitted = false;
    var lastResult = null;
    var lastSource = null;
    var copySequence = 0;
    var results = document.getElementById('results');
    var copyButton = document.getElementById('copy-result');
    var status = document.getElementById('calculation-status');
    var notice = document.getElementById('result-notice');
    var copyStatus = document.getElementById('copy-status');
    var presetButtons = Array.prototype.slice.call(document.querySelectorAll('[data-preset]'));

    function setText(id, text) {
      var element = document.getElementById(id);
      if (element) element.textContent = text;
    }

    function selectPreset(name) {
      presetButtons.forEach(function (button) {
        var active = button.dataset.preset === name;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    function checkPreset() {
      var active = presetButtons.find(function (button) { return button.classList.contains('is-active'); });
      if (!active) return;
      var values = presets[active.dataset.preset];
      if (!values || inputIds.slice(0, 6).some(function (id, index) { return parseDecimal(inputs[id].value) !== values[index]; })) selectPreset(null);
    }

    function fieldError(id) {
      var value = inputs[id].value.trim();
      if (!value) return id === 'portion-weight' ? '' : 'Введите значение.';
      var parsed = parseDecimal(value);
      if (parsed === null) return 'Введите число, например 100 или 12,5.';
      var weight = id.indexOf('weight') !== -1;
      if (parsed < 0 || (weight && parsed === 0)) return weight ? 'Вес должен быть больше нуля.' : 'Значение не может быть отрицательным.';
      if (parsed > (weight ? 10000000 : 100000)) return weight ? 'Введите вес не больше 10 000 000 г.' : 'Введите значение не больше 100 000.';
      return '';
    }

    function clearOutputs() {
      ['result-', 'total-', 'portion-'].forEach(function (prefix) {
        nutrientKeys.forEach(function (key) { setText(prefix + key, '—'); });
      });
      ['weight-factor', 'raw-summary', 'cooked-summary'].forEach(function (id) { setText(id, '—'); });
      setText('factor-label', 'Изменение веса');
      setText('weight-explanation', 'Введите КБЖУ и оба веса для расчёта.');
    }

    function update() {
      copySequence += 1;
      copyStatus.textContent = '';
      lastResult = null;
      lastSource = null;
      var errors = {};
      inputIds.forEach(function (id) {
        errors[id] = fieldError(id);
        var show = !!errors[id] && (touched[id] || submitted);
        inputs[id].setAttribute('aria-invalid', String(show));
        var error = document.getElementById('error-' + id);
        if (error) { error.textContent = show ? errors[id] : ''; error.hidden = !show; }
        var wrapper = document.querySelector('[data-field="' + id + '"]');
        if (wrapper) wrapper.classList.toggle('is-invalid', show);
      });
      var primaryInvalid = inputIds.slice(0, 6).some(function (id) { return !!errors[id]; });
      var portionInvalid = !!errors['portion-weight'];
      var source = {
        calories: inputs.calories.value, protein: inputs.protein.value,
        fat: inputs.fat.value, carbs: inputs.carbs.value,
        rawWeight: inputs['raw-weight'].value, cookedWeight: inputs['cooked-weight'].value,
        portionWeight: portionInvalid || !inputs['portion-weight'].value.trim() ? null : inputs['portion-weight'].value
      };
      if (primaryInvalid) {
        clearOutputs();
        var malformed = inputIds.slice(0, 6).some(function (id) { return inputs[id].value.trim() && errors[id]; });
        results.dataset.state = malformed ? 'invalid' : 'empty';
        document.querySelector('.result-eyebrow').textContent = malformed ? 'ПРОВЕРЬТЕ ДАННЫЕ' : 'ДОБАВЬТЕ ИСХОДНЫЕ ДАННЫЕ';
        notice.hidden = false;
        notice.textContent = malformed ? 'Проверьте введённые значения. Результат появится после исправления.' : 'Заполните КБЖУ на 100 г сырого продукта и вес до и после приготовления.';
        status.textContent = malformed ? 'Проверьте значения в полях.' : 'Заполните поля для расчёта.';
        copyButton.disabled = true;
        return;
      }
      var calculated;
      try { calculated = calculateNutrition(source); } catch (error) {
        clearOutputs();
        results.dataset.state = 'invalid';
        document.querySelector('.result-eyebrow').textContent = 'ПРОВЕРЬТЕ ДАННЫЕ';
        notice.hidden = false;
        notice.textContent = error.message;
        status.textContent = 'Проверьте веса: результат выходит за допустимый диапазон.';
        copyButton.disabled = true;
        return;
      }
      lastResult = calculated;
      lastSource = source;
      nutrientKeys.forEach(function (key) {
        setText('result-' + key, formatNumber(calculated.per100[key]));
        setText('total-' + key, formatNumber(calculated.total[key]));
        setText('portion-' + key, calculated.portion ? formatNumber(calculated.portion[key]) : '—');
      });
      results.dataset.state = portionInvalid ? 'invalid' : 'valid';
      document.querySelector('.result-eyebrow').textContent = portionInvalid ? 'РАСЧЁТ НА 100 Г ГОТОВ' : 'МОЖНО ЗАПИСЫВАТЬ';
      notice.hidden = !portionInvalid;
      notice.textContent = portionInvalid ? 'Проверьте вес порции. Расчёт на 100 г и на весь продукт готов.' : '';
      setText('weight-factor', '×' + formatNumber(calculated.factor));
      setText('factor-label', calculated.factor > 1 ? 'Вес увеличился' : calculated.factor < 1 ? 'Вес уменьшился' : 'Вес не изменился');
      setText('raw-summary', formatNumber(calculated.rawWeight) + ' г сырого');
      setText('cooked-summary', formatNumber(calculated.cookedWeight) + ' г готового');
      setText('weight-explanation', calculated.factor > 1 ? 'Вес вырос: КБЖУ на 100 г стало меньше. Общее КБЖУ продукта сохраняется.' : calculated.factor < 1 ? 'Вес уменьшился: КБЖУ на 100 г стало больше. Общее КБЖУ продукта сохраняется.' : 'Вес не изменился: КБЖУ на 100 г осталось прежним.');
      status.textContent = portionInvalid ? 'Основной расчёт готов. Проверьте вес порции.' : 'Расчёт обновлён.';
      copyButton.disabled = portionInvalid;
    }

    inputIds.forEach(function (id) {
      inputs[id].addEventListener('input', function () { checkPreset(); update(); });
      inputs[id].addEventListener('blur', function () { touched[id] = true; update(); });
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitted = true;
      update();
      var firstInvalid = inputIds.find(function (id) { return !!fieldError(id); });
      if (firstInvalid) {
        var details = inputs[firstInvalid].closest('details');
        if (details) details.open = true;
        inputs[firstInvalid].focus();
      } else results.focus();
    });
    presetButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var values = presets[button.dataset.preset];
        if (!values) return;
        inputIds.slice(0, 6).forEach(function (id, index) { inputs[id].value = String(values[index]); });
        touched = {}; submitted = false;
        selectPreset(button.dataset.preset);
        update();
      });
    });
    document.getElementById('reset-form').addEventListener('click', function (event) {
      event.preventDefault();
      inputIds.slice(0, 6).forEach(function (id) { inputs[id].value = ''; });
      inputs['portion-weight'].value = '100';
      touched = {}; submitted = false;
      selectPreset(null);
      update();
      inputs.calories.focus();
    });

    function nutritionLine(values) {
      return formatNumber(parseDecimal(values.calories)) + ' ккал; белки ' + formatNumber(parseDecimal(values.protein)) + ' г; жиры ' + formatNumber(parseDecimal(values.fat)) + ' г; углеводы ' + formatNumber(parseDecimal(values.carbs)) + ' г';
    }
    function fallbackCopy(text) {
      var previous = document.activeElement;
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      var success = false;
      try { success = typeof document.execCommand === 'function' && document.execCommand('copy'); } catch (_) { success = false; }
      textarea.remove();
      if (previous && typeof previous.focus === 'function') previous.focus();
      return success;
    }
    copyButton.addEventListener('click', async function () {
      if (!lastResult || copyButton.disabled) return;
      var sequence = ++copySequence;
      var text = 'КБЖУ после приготовления\nИсходные значения на 100 г сырого продукта: ' + nutritionLine(lastSource) + '\nВес сырого продукта: ' + formatNumber(lastResult.rawWeight) + ' г\nВес готового продукта: ' + formatNumber(lastResult.cookedWeight) + ' г\nНа 100 г готового продукта: ' + nutritionLine(lastResult.per100) + '\nНа весь готовый продукт: ' + nutritionLine(lastResult.total);
      if (lastResult.portion) text += '\nНа порцию ' + formatNumber(lastResult.portionWeight) + ' г: ' + nutritionLine(lastResult.portion);
      var success = false;
      try {
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { await root.navigator.clipboard.writeText(text); success = true; }
      } catch (_) { success = false; }
      if (!success) success = fallbackCopy(text);
      if (sequence === copySequence) copyStatus.textContent = success ? 'Результат скопирован.' : 'Не удалось скопировать. Выделите и скопируйте результат вручную.';
    });
    checkPreset();
    update();
  }

  var api = { parseDecimal: parseDecimal, calculateNutrition: calculateNutrition, formatNumber: formatNumber };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
  }
}(typeof window !== 'undefined' ? window : globalThis));
