// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { classifyCameraError } from "@/lib/cameraSupport";
import {
  computeMod11CheckDigit,
  parseAccessKey44,
  parseFiscalInput,
  parseNfeXml,
} from "@/lib/fiscalDocuments";

function makeValidAccessKey(prefix43: string): string {
  const dv = computeMod11CheckDigit(prefix43);
  return `${prefix43}${dv}`;
}

describe("fiscalDocuments & cameraSupport", () => {
  it("valida chave de acesso de 44 dígitos para DF (NFC-e modelo 65) e NF-e (modelo 55)", () => {
    const prefixDf65 = "5326111234567800019065001000012345100012345";
    const validDfKey = makeValidAccessKey(prefixDf65);

    const parsed = parseAccessKey44(validDfKey);
    expect(parsed).not.toBeNull();
    expect(parsed?.valid).toBe(true);
    expect(parsed?.ufCode).toBe("53");
    expect(parsed?.uf).toBe("DF");
    expect(parsed?.docType).toBe("nfce_65");
    expect(parsed?.yearMonth).toBe("2026-11");
    expect(parsed?.formattedCnpj).toBe("12.345.678/0001-90");
    expect(parsed?.series).toBe("1");
    expect(parsed?.number).toBe("12345");

    const prefixSp55 = "3526109876543200011055002000099887100099887";
    const validSpKey = makeValidAccessKey(prefixSp55);
    const parsedNfe = parseAccessKey44(validSpKey);
    expect(parsedNfe?.valid).toBe(true);
    expect(parsedNfe?.uf).toBe("SP");
    expect(parsedNfe?.docType).toBe("nfe_55");
  });

  it("rejeita chave com dígito verificador adulterado ou mês inválido", () => {
    const prefix = "5326111234567800019065001000012345100012345";
    const dv = computeMod11CheckDigit(prefix);
    const wrongDv = (dv + 1) % 10;
    const badKey = `${prefix}${wrongDv}`;

    const parsedBadDv = parseAccessKey44(badKey);
    expect(parsedBadDv?.valid).toBe(false);
    expect(parsedBadDv?.reason).toContain("Dígito verificador inválido");

    const badMonthPrefix = "5326191234567800019065001000012345100012345";
    const badMonthKey = makeValidAccessKey(badMonthPrefix);
    const parsedBadMonth = parseAccessKey44(badMonthKey);
    expect(parsedBadMonth?.valid).toBe(false);
    expect(parsedBadMonth?.reason).toContain("Mês de emissão inválido");
  });

  it("interpreta URL de QR Code da SEFAZ-DF e chave digitada manualmente", () => {
    const key = makeValidAccessKey("5326111234567800019065001000012345100012345");
    const qrUrl = `https://www.fazenda.df.gov.br/nfce/qrcode?p=${key}|2|1|1|ABCDEF123456`;

    const fromQr = parseFiscalInput(qrUrl);
    expect(fromQr.uf).toBe("DF");
    expect(fromQr.docType).toBe("nfce_65");
    expect(fromQr.accessKey).toBe(key);
    expect(fromQr.keyValid).toBe(true);
    expect(fromQr.sourceUrl).toBe(qrUrl);
    expect(fromQr.canAttemptAutoConsult).toBe(true);

    const fromManualKey = parseFiscalInput(key.replace(/(.{4})/g, "$1 ").trim());
    expect(fromManualKey.uf).toBe("DF");
    expect(fromManualKey.accessKey).toBe(key);
    expect(fromManualKey.keyValid).toBe(true);
    expect(fromManualKey.sourceUrl).toBe("");
    expect(fromManualKey.canAttemptAutoConsult).toBe(false);
  });

  it("lê XML completo de NFC-e (Mod. 65) e NF-e (Mod. 55) extraindo emitente, endereço, itens, descontos e Pix", () => {
    const validKey = makeValidAccessKey("5326111234567800019065001000054321100054321");
    const nfceXml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
        <NFe>
          <infNFe Id="NFe${validKey}" versao="4.00">
            <ide>
              <cUF>53</cUF>
              <mod>65</mod>
              <serie>1</serie>
              <nNF>54321</nNF>
              <dhEmi>2026-11-18T14:32:00-03:00</dhEmi>
            </ide>
            <emit>
              <CNPJ>12345678000190</CNPJ>
              <xNome>Supermercado Central Brasília LTDA</xNome>
              <xFant>Supermercado Central</xFant>
              <enderEmit>
                <xLgr>CLS 302 Bloco A</xLgr>
                <nro>10</nro>
                <xBairro>Asa Sul</xBairro>
                <xMun>Brasília</xMun>
                <UF>DF</UF>
              </enderEmit>
            </emit>
            <det nItem="1">
              <prod>
                <cProd>7891000</cProd>
                <cEAN>7891000100103</cEAN>
                <xProd>ARROZ BRANCO TIPO 1 PAC 5KG</xProd>
                <qCom>2.000</qCom>
                <uCom>UN</uCom>
                <vUnCom>26.50</vUnCom>
                <vProd>53.00</vProd>
                <vDesc>3.00</vDesc>
              </prod>
            </det>
            <det nItem="2">
              <prod>
                <cProd>2001</cProd>
                <cEAN>SEM GTIN</cEAN>
                <xProd>BANANA PRATA KG</xProd>
                <qCom>1.450</qCom>
                <uCom>KG</uCom>
                <vUnCom>8.00</vUnCom>
                <vProd>11.60</vProd>
              </prod>
            </det>
            <total>
              <ICMSTot>
                <vDesc>3.00</vDesc>
                <vNF>61.60</vNF>
              </ICMSTot>
            </total>
            <pag>
              <detPag>
                <tPag>17</tPag>
                <vPag>61.60</vPag>
              </detPag>
            </pag>
          </infNFe>
        </NFe>
      </nfeProc>`;

    const parsed = parseNfeXml(nfceXml);
    expect(parsed.docType).toBe("nfce_65");
    expect(parsed.uf).toBe("DF");
    expect(parsed.store).toBe("Supermercado Central");
    expect(parsed.cnpj).toBe("12.345.678/0001-90");
    expect(parsed.emitterAddress).toContain("Asa Sul");
    expect(parsed.issuedAt).toBe("2026-11-18");
    expect(parsed.issuedTime).toBe("14:32");
    expect(parsed.accessKey).toBe(validKey);
    expect(parsed.paymentMethod).toBe("Pix");
    expect(parsed.discountCents).toBe(300);
    expect(parsed.totalCents).toBe(6160);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.ean).toBe("7891000100103");
    expect(parsed.items[0]?.totalCents).toBe(5000);
    expect(parsed.items[1]?.quantity).toBeCloseTo(1.45, 3);
    expect(parsed.items[1]?.ean).toBeUndefined();
  });

  it("classifica corretamente erros de câmera em iframe vs navegador independente", () => {
    const iframeDenied = classifyCameraError(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }),
      { isSecureContext: true, isInIframe: true, iframeCameraBlocked: false },
    );
    expect(iframeDenied.code).toBe("iframe_blocked");
    expect(iframeDenied.blockedByPermission).toBe(true);
    expect(iframeDenied.shouldRetryWithFallback).toBe(false);

    const standaloneDenied = classifyCameraError(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }),
      { isSecureContext: true, isInIframe: false, iframeCameraBlocked: false },
    );
    expect(standaloneDenied.code).toBe("permission_denied");
    expect(standaloneDenied.blockedByPermission).toBe(true);

    const insecure = classifyCameraError(new Error("Blocked"), { isSecureContext: false });
    expect(insecure.code).toBe("insecure_context");

    const overconstrained = classifyCameraError(
      Object.assign(new Error("Constraint error"), { name: "OverconstrainedError" }),
      { isSecureContext: true, isInIframe: false },
    );
    expect(overconstrained.code).toBe("overconstrained");
    expect(overconstrained.shouldRetryWithFallback).toBe(true);
  });
});
