# Mock DWD warnings for testing
hass.states.set('sensor.berlin_aktuelle_warnstufe', '1', {
    'warning_1_headline': 'Amtliche WARNUNG vor extremer HITZE',
    'warning_1_description': 'Am Sonntag wird eine extreme Wärmebelastung bis zu einer Höhe von 400m erwartet. Am Montag wird eine extreme Wärmebelastung bis zu einer Höhe von 400m erwartet. Heute ist der 4. Tag der Warnsituation in Folge.',
    'warning_1_level': 4,
    'warning_1_start': '2026-06-22T03:00:00+02:00',
    'warning_1_end': '2026-06-23T15:00:00+02:00',
    'warning_1_instruction': 'Gefahr durch: mögliche erhebliche Frostschäden; Unterkühlung bei längerem Aufenthalt im Freien; einfrierende Wasserleitungen. Handlungsempfehlungen: Frostschutzmaßnahmen ergreifen, z.B. Pflanzen abdecken oder Wasser aus Außenleitungen ablassen; längere Aufenthalte im Freien vermeiden',
    'warning_1_type': 1
})
