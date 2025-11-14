/**
 * Add signature placeholder to PDF for signing
 *
 * Creates a blank signature field with ByteRange placeholder
 * that can later be filled by the signing process.
 */

import * as fs from 'fs/promises';

export async function addSignaturePlaceholder(
  inputPdfPath: string,
  outputPdfPath: string,
  signaturePlaceholderSize: number = 20000
): Promise<void> {
  const pdfBuffer = await fs.readFile(inputPdfPath);
  const pdfString = pdfBuffer.toString('latin1');

  // Find the last object number
  const objectMatches = pdfString.matchAll(/^(\d+)\s+\d+\s+obj/gm);
  let maxObjNum = 0;
  for (const match of objectMatches) {
    const objNum = parseInt(match[1]);
    if (objNum > maxObjNum) maxObjNum = objNum;
  }

  const sigObjNum = maxObjNum + 1;
  const sigFieldObjNum = maxObjNum + 2;

  // Create signature dictionary object
  const placeholder = '0'.repeat(signaturePlaceholderSize);
  const signatureObj = `${sigObjNum} 0 obj
<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /ETSI.CAdES.detached
  /ByteRange [0 /********** /********** /**********]
  /Contents <${placeholder}>
>>
endobj
`;

  // Create signature field object
  const signatureFieldObj = `${sigFieldObjNum} 0 obj
<<
  /Type /Annot
  /Subtype /Widget
  /FT /Sig
  /T (Signature1)
  /V ${sigObjNum} 0 R
  /P 3 0 R
  /Rect [0 0 0 0]
  /F 4
>>
endobj
`;

  // Find the xref table
  const xrefMatch = pdfString.match(/xref\s+(\d+)\s+(\d+)([\s\S]*?)trailer/);
  if (!xrefMatch) {
    throw new Error('Could not find xref table');
  }

  const xrefStartObj = parseInt(xrefMatch[1]);
  const xrefCount = parseInt(xrefMatch[2]);

  // Insert signature objects before xref
  const xrefIndex = pdfString.indexOf('xref');

  const beforeXref = pdfString.substring(0, xrefIndex);
  const signatureObjOffset = beforeXref.length;
  const signatureFieldObjOffset = signatureObjOffset + signatureObj.length;

  const newXrefCount = Math.max(xrefCount, sigFieldObjNum + 1);

  // Build new xref table
  let xrefEntries = xrefMatch[3].trim().split('\n');

  // Add entries for new objects
  while (xrefEntries.length < newXrefCount) {
    xrefEntries.push('0000000000 65535 f ');
  }

  // Update signature object entries
  xrefEntries[sigObjNum] = `${signatureObjOffset.toString().padStart(10, '0')} 00000 n `;
  xrefEntries[sigFieldObjNum] = `${signatureFieldObjOffset.toString().padStart(10, '0')} 00000 n `;

  const newXref = `xref\n0 ${newXrefCount}\n${xrefEntries.join('\n')}\ntrailer`;

  // Find trailer dictionary
  const trailerMatch = pdfString.match(/trailer\s*<<([\s\S]*?)>>\s*startxref/);
  if (!trailerMatch) {
    throw new Error('Could not find trailer');
  }

  // Update trailer to include AcroForm with signature field
  const newTrailer = `trailer\n<<
${trailerMatch[1]}
  /AcroForm <<
    /Fields [${sigFieldObjNum} 0 R]
    /SigFlags 3
  >>
>>\nstartxref`;

  // Build new PDF
  const newPdf = beforeXref + signatureObj + signatureFieldObj + newXref + newTrailer;
  const startxrefMatch = newPdf.match(/startxref\s*$/);
  const startxrefOffset = newPdf.indexOf('xref');

  const finalPdf = newPdf + `\n${startxrefOffset}\n%%EOF\n`;

  await fs.writeFile(outputPdfPath, Buffer.from(finalPdf, 'latin1'));

  console.log(`  ✅ Added signature placeholder to PDF`);
  console.log(`  ✅ Signature object: ${sigObjNum} 0 R`);
  console.log(`  ✅ Signature field: ${sigFieldObjNum} 0 R`);
}
