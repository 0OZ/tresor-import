import Big from 'big.js';
import {
  parseGermanNum,
  validateActivity,
  createActivityDateTime,
  timeRegex,
} from '@/helper';

const getTableValueByKey = (textArr, startLineNumer, key) => {
  const finding = textArr.find(
    t =>
      textArr.indexOf(t, startLineNumer - 1) > startLineNumer &&
      t.match(new RegExp(key + '\\s*:\\s+'))
  );
  const result = finding
    ? finding.match(new RegExp(key + '\\s*:\\s+((\\s?\\S+\\s?\\S*)+)\\s*'))
    : null;
  return result ? result[1] : null;
};

const getHeaderValueByKey = (textArr, startLineNumer, key) => {
  const result = textArr.find(
    t => textArr.indexOf(t) >= startLineNumer && t.includes(key + ' ')
  );
  return result ? result.match(new RegExp(key + '\\s\\s+(.+)'))[1] : null;
};

const findTableIndexes = textArr => {
  let lineNumbers = [];
  textArr.forEach((line, lineNumber) => {
    if (!/Nr.\d+(\/\d)?/.test(line)) {
      return;
    }

    lineNumbers.push(lineNumber);
  });

  return lineNumbers;
};

const findISIN = (textArr, tableIndex) => {
  const isinStr = textArr[tableIndex].trim();
  const isinMatch = isinStr.match(/([A-Z]{2})((?![A-Z]{10})[A-Z0-9]{10})/);
  return isinMatch ? isinMatch[0] : null;
};

const findCompany = (textArr, tableIndex) => {
  const companyStr = textArr[tableIndex].trim();
  const companyMatch = companyStr.match(
    /Nr.\d+(\/\d)?\s+(Kauf|Verkauf)?\s+((\S+\s?\S*)+)\s+(\(|DL)/
  );
  return companyMatch ? companyMatch[3].trim() : null;
};

const findDateBuySell = (textArr, startLineNumer) =>
  getTableValueByKey(textArr, startLineNumer, 'Schlusstag')
    ? getTableValueByKey(textArr, startLineNumer, 'Schlusstag').split(', ')[0] // standard stock
    : getHeaderValueByKey(textArr, 0, 'Handelstag'); // etf

const findOrderTime = (textArr, startLineNumer) => {
  const lineWithOrderTime = getTableValueByKey(
    textArr,
    startLineNumer,
    'Schlusstag'
  );

  if (lineWithOrderTime !== null && timeRegex(false).test(lineWithOrderTime)) {
    return lineWithOrderTime.split(' ')[1].trim();
  }

  const lineWithExecutionTime = getHeaderValueByKey(
    textArr,
    0,
    'Ausführungszeit'
  );

  if (
    lineWithExecutionTime === null ||
    !timeRegex(false).test(lineWithExecutionTime)
  ) {
    return undefined;
  }

  return lineWithExecutionTime.split(' ')[0];
};

const findShares = (textArr, startLineNumer) =>
  parseGermanNum(
    getTableValueByKey(textArr, startLineNumer, 'Ordervolumen')
      ? getTableValueByKey(textArr, startLineNumer, 'Ordervolumen').split(
          ' '
        )[0] // stock
      : getTableValueByKey(textArr, startLineNumer, 'Ausgeführt')
      ? getTableValueByKey(textArr, startLineNumer, 'Ausgeführt').split(' ')[0] // etf
      : getTableValueByKey(textArr, startLineNumer, 'St.').split(' ')[0] // dividend
  );

const findPrice = (textArr, startLineNumer) =>
  parseGermanNum(
    getTableValueByKey(textArr, startLineNumer, 'Kurs').split(' ')[0]
  );

const findAmount = (textArr, startLineNumer) =>
  parseGermanNum(
    getTableValueByKey(textArr, startLineNumer, 'Kurswert').split(' ')[0]
  );

const findFee = (textArr, startLineNumer) => {
  const provision = getTableValueByKey(textArr, startLineNumer, 'Provision')
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Provision').split(' ')[0]
      )
    : 0;
  const ownExpenses = getTableValueByKey(
    textArr,
    startLineNumer,
    'Eigene Spesen'
  )
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Eigene Spesen').split(
          ' '
        )[0]
      )
    : 0;
  const foreignExpenses = getTableValueByKey(
    textArr,
    startLineNumer,
    'Fremde Spesen'
  )
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Fremde Spesen').split(
          ' '
        )[0]
      )
    : 0;

  return +Big(provision).plus(Big(ownExpenses)).plus(Big(foreignExpenses));
};

const findTax = (textArr, startLineNumer) =>
  getTableValueByKey(textArr, startLineNumer, 'Einbeh. Steuer')
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Einbeh. Steuer').split(
          ' '
        )[0]
      )
    : getTableValueByKey(textArr, startLineNumer, 'Einbeh. KESt')
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Einbeh. KESt').split(
          ' '
        )[0]
      )
    : 0;

const findDividendTax = (textArr, startLineNumer) => {
  const assessmentBasis = getTableValueByKey(
    textArr,
    startLineNumer,
    'grundlage'
  )
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'grundlage').split(' ')[0]
      )
    : 0; // Bemessungsgrundlage
  const netDividend = getTableValueByKey(textArr, startLineNumer, 'Endbetrag')
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'Endbetrag').split(' ')[0]
      )
    : 0;

  return assessmentBasis > 0
    ? +Big(assessmentBasis).minus(Big(netDividend))
    : 0;
};

const findDateDividend = (textArr, startLineNumer) =>
  getTableValueByKey(textArr, startLineNumer, 'Valuta');

const findPayout = (textArr, startLineNumer) => {
  const assessmentBasis = getTableValueByKey(
    textArr,
    startLineNumer,
    'grundlage'
  )
    ? parseGermanNum(
        getTableValueByKey(textArr, startLineNumer, 'grundlage').split(' ')[0]
      )
    : 0; // Bemessungsgrundlage

  if (assessmentBasis <= 0) {
    const payoutForeign = getTableValueByKey(
      textArr,
      startLineNumer,
      'Bruttodividende'
    ).split(' ')[0];
    const conversionRate = getTableValueByKey(
      textArr,
      startLineNumer,
      'Devisenkurs'
    ).split(' ')[0];
    return +Big(parseGermanNum(payoutForeign)).div(
      parseGermanNum(conversionRate)
    );
  }
  return assessmentBasis;
};

const lineContains = (textArr, lineNumber, value) =>
  textArr[lineNumber].includes(value);

export const canParsePage = (content, extension) =>
  extension === 'pdf' &&
  content.some(
    line =>
      line.includes('flatex Bank AG') || line.includes('FinTech Group Bank AG')
  ) &&
  (content.some(line => line.includes('Kauf')) ||
    content.some(line => line.includes('Verkauf')) ||
    content.some(line => line.includes('Dividendengutschrift')) ||
    content.some(line => line.includes('Ertragsmitteilung')));

const parsePage = (textArr, startLineNumer) => {
  let type, date, time, isin, company, shares, price, amount, fee, tax;

  if (lineContains(textArr, startLineNumer, 'Kauf')) {
    type = 'Buy';
    isin = findISIN(textArr, startLineNumer);
    company = findCompany(textArr, startLineNumer);
    date = findDateBuySell(textArr, startLineNumer);
    time = findOrderTime(textArr, startLineNumer);
    shares = findShares(textArr, startLineNumer);
    amount = findAmount(textArr, startLineNumer);
    price = findPrice(textArr, startLineNumer);
    fee = findFee(textArr, startLineNumer);
    tax = 0;
  } else if (lineContains(textArr, startLineNumer, 'Verkauf')) {
    type = 'Sell';
    isin = findISIN(textArr, startLineNumer);
    company = findCompany(textArr, startLineNumer);
    date = findDateBuySell(textArr, startLineNumer);
    time = findOrderTime(textArr, startLineNumer);
    shares = findShares(textArr, startLineNumer);
    amount = findAmount(textArr, startLineNumer);
    price = findPrice(textArr, startLineNumer);
    fee = findFee(textArr, startLineNumer);
    tax = findTax(textArr, startLineNumer);
  } else if (
    lineContains(textArr, startLineNumer - 3, 'Dividendengutschrift') ||
    lineContains(textArr, startLineNumer - 3, 'Ertragsmitteilung')
  ) {
    type = 'Dividend';
    isin = findISIN(textArr, startLineNumer);
    company = findCompany(textArr, startLineNumer);
    date = findDateDividend(textArr, startLineNumer);
    shares = findShares(textArr, startLineNumer);
    amount = findPayout(textArr, startLineNumer);
    price = amount / shares;
    fee = 0;
    tax = findDividendTax(textArr, startLineNumer);
  }

  const [parsedDate, parsedDateTime] = createActivityDateTime(date, time);

  return validateActivity({
    broker: 'flatex',
    type,
    date: parsedDate,
    datetime: parsedDateTime,
    isin,
    company,
    shares,
    price,
    amount,
    fee,
    tax,
  });
};

export const parsePages = contents => {
  let activities = [];

  for (let content of contents) {
    try {
      findTableIndexes(content).forEach(index => {
        let activity = parsePage(content, index);
        if (activity === undefined) {
          return;
        }

        activities.push(activity);
      });
    } catch (exception) {
      console.error('Error while parsing page (flatex)', exception, content);
    }
  }

  return {
    activities,
    status: 0,
  };
};
