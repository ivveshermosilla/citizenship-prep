#!/usr/bin/env python3
"""Build the draft Quick Question catalogue and human-readable review report."""
from pathlib import Path
import json, re, unicodedata

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research/2026-10-27/answers'
SOURCE_INDEX = {x['id']: x['url'] for x in json.loads((RESEARCH/'sources.json').read_text())['sources']}
OUT = ROOT / 'content/practice'
VERSION = 'npa-practice-2026-10-28-v1'

GEO_QUESTIONS = {'2008': {20, 23, 43, 44}, '2025': {23, 29, 61, 62}}
DYNAMIC_NATIONAL = {'2008': {28,29,40,46,47}, '2025': {30,38,39,57}}
FIXED_GROUPS = {
 ('2008',13): [('legislative','Congress',['legislative','legislative branch']),('executive','the President',['President','executive','executive branch']),('judicial','the courts',['judicial','judicial branch'])],
 ('2008',16): [('congress','Congress',['Senate and House (of Representatives)','Senate and House of Representatives','(U.S. or national) legislature','U.S. legislature','national legislature'])],
 ('2008',6): [('speech','speech',['freedom of speech','freedom of expression']),('religion','religion',['freedom of religion']),('assembly','assembly',['freedom of assembly']),('press','press',['freedom of the press','freedom of press']),('petition','petition the government',['freedom to petition the government'])],
 ('2008',17): [('senate','Senate',['the Senate']),('house','House of Representatives',['House','the House of Representatives'])],
 ('2008',45): [('democratic','Democratic Party',['Democratic','Democratic Party']),('republican','Republican Party',['Republican','Republican Party'])],
 ('2025',16): [('legislative','Legislative branch',['legislative','the legislative branch','Congress','Congress (legislative branch)']),('executive','Executive branch',['executive','the executive branch','President','president']),('judicial','Judicial branch',['judicial','the judicial branch','the courts','courts'])],
 ('2025',18): [('legislative','Congress',['(U.S.) Congress','U.S. Congress','(U.S. or national) legislature','U.S. legislature','national legislature','Legislative branch','legislative branch'])],
 ('2025',19): [('senate','Senate',['the Senate']),('house','House of Representatives',['House','the House of Representatives'])],
 ('2025',4): [('popular-government','Self-government',['Popular sovereignty','Consent of the governed','People should govern themselves']),('social-contract','Social contract',['(Example of) social contract'])],
 ('2025',13): [('rule-of-law','Everyone must follow the law',['Leaders must obey the law','Government must obey the law','No one is above the law'])],
 ('2025',15): [('checks-and-balances','One part does not become too powerful',['So one part does not become too powerful','Checks and balances','Separation of powers'])],
 ('2025',28): [('equal-representation','Equal representation for small states',['Equal representation','The Great Compromise','Connecticut Compromise'])],
 ('2025',31): [('state-constituents','Citizens of their state',['People of their state'])],
 ('2025',33): [('district-constituents','Citizens in their congressional district',['Citizens in their district','People from their congressional district','People in their district'])],
 ('2025',35): [('population','State population',['Because of the state’s population','Because they have more people','Because some states have more people'])],
 ('2025',66): [('pledge-loyalty','The United States',['The flag'])],
 ('2025',124): [('out-of-many-one','Out of many, one',['We all become one'])],
 ('2008',81): [('japan','Japan',[]),('germany','Germany',[]),('italy','Italy',[])],
 ('2008',51): [('expression','freedom of expression',['freedom of speech','speech']),('assembly','freedom of assembly',['assembly']),('petition','freedom to petition the government',['petition the government']),('religion','freedom of religion',['religion']),('arms','right to bear arms',['bear arms'])],
 ('2025',65): [('expression','freedom of expression',['freedom of speech','speech']),('assembly','freedom of assembly',['assembly']),('petition','freedom to petition the government',['petition the government']),('religion','freedom of religion',['religion']),('arms','right to bear arms',['bear arms'])],
}
REQUIRED = {('2008',9):2,('2008',17):2,('2008',36):2,('2008',45):2,('2008',51):2,('2008',55):2,('2008',64):3,('2008',81):3,('2008',100):2,
 ('2025',10):2,('2025',16):3,('2025',19):2,('2025',48):2,('2025',65):3,('2025',67):2,('2025',69):2,('2025',81):5,('2025',126):3}

# Question-by-question answer candidates. Every scalar contains three complete
# one-field wrong responses; every list of pairs/triples is a complete wrong
# submission for that prompt. No candidate is inferred from an unrelated pool.
CURATED = {
'2008': {
1:'Declaration of Independence|Articles of Confederation|Federalist Papers',
2:'It appoints state governors|It sets the federal income-tax filing date|It elects the President directly',
3:'Life, Liberty, and the pursuit of Happiness|Four score and seven years ago|In God We Trust',
4:'A court ruling that changes one case|A presidential executive order|A statute passed by Congress',
5:'Articles of Confederation|Federalist Papers|Declaration of Independence',
6:'A right to establish an official national religion|A ban on peaceful criticism of government|A ban on peaceful assembly',
7:'10|21|26',
8:'Created the federal government|Established the first ten amendments|Ended all taxes on the colonies',
9:['right to vote+right to bear arms','freedom of assembly+freedom of religion','right to a jury trial+right to petition Congress'],
10:'You must practice the religion chosen by the government|Religious practice is allowed only in private|People must belong to a religious group',
11:'command economy|feudal economy|barter-only economy',
12:'The President is above the law|Only citizens must obey the law|Officials may ignore laws they dislike',
13:'a private corporation|a political party|a newspaper',
14:'unlimited executive authority|one branch controls all government powers|rule by a hereditary monarch',
15:'the Speaker of the House|the Chief Justice|the Secretary of State',
16:'the President|the Supreme Court|the Cabinet',
17:['President+Cabinet','Supreme Court+federal courts','governor+state legislature'],
18:'50|435|1,000',19:'two years|four years|eight years',
20:'John R. Curtis|Lisa Murkowski|Cory Booker|Susan Collins|Tammy Duckworth|Ted Cruz',
21:'100|50|500',22:'one year|four years|six years',
23:'Mike Kennedy|Sarah McBride|Alexandria Ocasio-Cortez|Hakeem Jeffries|Brian Fitzpatrick',
24:'the people of one congressional district|only the federal government|the people of the entire country',
25:'the state’s land area|the state’s age|the number of counties in the state',
26:'two years|six years|eight years',27:'January|May|September',
28:'Joe Biden|Barack Obama|George W. Bush|Bill Clinton|George H. W. Bush|Ronald Reagan|Jimmy Carter|Gerald Ford',
29:'Kamala Harris|Mike Pence|Tim Kaine|Joe Biden|Dick Cheney|Al Gore',
30:'the Speaker of the House|the Chief Justice|the Secretary of Defense',
31:'the Vice President|the Chief Justice|the Secretary of State',
32:'the Secretary of Defense|the Speaker of the House|the Chairman of the Joint Chiefs of Staff',
33:'the Vice President|the Speaker of the House|the Chief Justice',
34:'Congress|the Vice President|the Supreme Court',
35:'commands the military|decides whether laws are constitutional|writes federal statutes',
36:['Deputy Secretary of State+White House Press Secretary','Assistant Secretary of the Treasury+Deputy Attorney General','Deputy Secretary of Defense+Deputy Secretary of Labor'],
37:'writes laws|commands the military|vetoes bills',
38:'a federal court of appeals|a state supreme court|a federal district court',
39:'five|seven|eleven',
40:'William Rehnquist|Warren Burger|Earl Warren|Harlan Fiske Stone|Charles Evans Hughes|John Marshall|Roger Taney|Salmon P. Chase',
41:'issue a state driver license|approve a city zoning permit|issue a local building permit',
42:'declare war|make treaties|print paper money',
43:'Gavin Newsom|Greg Abbott|Jared Polis|Spencer Cox|J.B. Pritzker|Sarah Huckabee Sanders',
44:'Denver|Sacramento|Phoenix|Austin|Albany|Boston',
45:['Green Party+Libertarian Party','Libertarian Party+Constitution Party','Constitution Party+Working Families Party'],
46:'Democratic Party|Green Party|Libertarian Party|Constitution Party',
47:'Nancy Pelosi|Paul Ryan|John Boehner|Kevin McCarthy|Newt Gingrich|Dennis Hastert',
48:'Only landowners may vote|Only men may vote|Citizens must pay a poll tax to vote',
49:'pay federal taxes|attend public school|serve in the U.S. military',
50:'freedom of speech|freedom of religion|the right to bear arms',
51:['a right to require an official national religion+a right to silence peaceful criticism','a right to prevent peaceful assembly+a right to control private beliefs','a right to ban petitions to government+a right to censor all newspapers'],
52:'the Constitution|the President|Congress',
53:'promise to become a federal employee|promise to vote in every election|promise to serve on a jury every year',
54:'sixteen|twenty-one|twenty-five',
55:['avoid public affairs+refuse to contact officials','ignore elections+prevent others from voting','refuse all community activity+avoid public meetings'],
56:'May 15|September 30|December 31',57:'at age sixteen|at age thirty|at age thirty-five',
58:'to join the 1849 California Gold Rush|to serve in the U.S. Peace Corps|to take part in the Apollo program',
59:'Spanish settlers|British colonists|French explorers',
60:'British merchants|European colonists|people from Australia',
61:'because Britain granted the colonies full self-government|because Britain ended all colonial taxes|because the colonists wanted a monarch',
62:'George Washington|Alexander Hamilton|James Madison',
63:'July 2, 1776|July 4, 1787|June 4, 1776',
64:['Ohio+Kentucky+Tennessee','Maine+Florida+California','Texas+Hawaii+Oregon'],
65:'The Declaration of Independence was written|The Bill of Rights was adopted|The Articles of Confederation were signed',
66:'1776|1781|1789',67:'Thomas Jefferson|John Adams|Patrick Henry',
68:'served as President|commanded the Continental Army|served as Chief Justice',
69:'Thomas Jefferson|John Adams|Benjamin Franklin',70:'John Adams|Thomas Jefferson|James Madison',
71:'Florida Territory|Oregon Country|Alaska',
72:'World War I|World War II|Korean War',73:'War of 1812|Mexican-American War|Spanish-American War',
74:'World War I|the Great Depression|the Cold War',
75:'wrote the Declaration of Independence|bought the Louisiana Territory|commanded the Continental Army during the Revolution',
76:'freed enslaved people in every country|ended slavery in the states loyal to the Union|granted women the right to vote',
77:'served as President|commanded the Continental Army|wrote the Constitution',
78:'the American Revolution|the Civil War|the War of 1812',
79:'William Howard Taft|Franklin Roosevelt|Warren G. Harding',80:'Herbert Hoover|Harry Truman|Calvin Coolidge',
81:['Britain+France+Soviet Union','Soviet Union+China+Australia','France+Canada+New Zealand'],
82:'World War I|the Korean War|the Spanish-American War',
83:'the spread of feudalism|piracy on the Atlantic|the return of colonial rule',
84:'the temperance movement|the conservation movement|the antitrust movement',
85:'served as a U.S. President|commanded the Continental Army|wrote the Declaration of Independence',
86:'the Moon landing|the attack on Pearl Harbor|the end of World War II',
87:'Amish|Cajun|Pennsylvania Dutch',88:'Colorado River|Ohio River|Rio Grande',
89:'Atlantic Ocean|Indian Ocean|Arctic Ocean',90:'Pacific Ocean|Indian Ocean|Arctic Ocean',
91:'Hawaii|Ontario|California',92:'Florida|Texas|Hawaii',93:'Oklahoma|Colorado|Nevada',
94:'Philadelphia|New York City|Boston',
95:'Boston Harbor, Massachusetts|Potomac River, Virginia|San Francisco Bay, California',
96:'the 50 states|the first 13 amendments|the 13 Presidents',
97:'the 13 original colonies|one star for each U.S. territory|the 50 original states',
98:'America the Beautiful|My Country, ’Tis of Thee|God Bless America',
99:'November 11|January 1|May 1',
100:['Texas Independence Day+Patriots’ Day','César Chávez Day+Confederate Memorial Day','Alaska Day+Patriots’ Day'],
},
'2025': {
1:'absolute monarchy|military dictatorship|hereditary theocracy',
2:'Declaration of Independence|Articles of Confederation|Federalist Papers',
3:'It sets the federal tax deadline|It elects state governors|It names the national anthem',
4:'The President governs without public consent|The people have no role in government|The Constitution is controlled by a monarch',
5:'a presidential executive order|a Supreme Court ruling|an ordinary federal statute',
6:'the powers of Congress|the duties of state governors|the terms of federal judges',
7:'10|21|26',
8:'It established a hereditary monarchy|It created the current federal government|It ended all disagreements between the states',
9:'U.S. Constitution|Articles of Confederation|Federalist Papers',
10:['divine right of kings+hereditary monarchy','unlimited royal power+aristocratic rule','state religion+absolute monarchy'],
11:'U.S. Constitution|Articles of Confederation|Federalist Papers',
12:'command economy|feudal economy|barter-only economy',
13:'The President is above the law|Only citizens must obey the law|Officials may ignore laws they dislike',
14:'Emancipation Proclamation|Gettysburg Address|Civil Rights Act of 1964',
15:'to give one branch unlimited authority|to let the President write every law|to prevent the public from voting',
16:['military+economic+diplomatic','state+local+military','economic+diplomatic+state'],
17:'Legislative branch|Judicial branch|Military branch',
18:'the President|the Supreme Court|the Cabinet',
19:['President+Cabinet','Supreme Court+federal courts','governor+state legislature'],
20:'vetoes bills|commands the military|decides whether laws are constitutional',
21:'50|435|1,000',22:'two years|four years|eight years',
23:'John R. Curtis|Lisa Murkowski|Cory Booker|Susan Collins|Tammy Duckworth|Ted Cruz',24:'100|50|500',25:'one year|four years|six years',
26:'to insulate representatives from voters|because the House cannot pass laws|to give representatives lifetime terms',
27:'one|three|fifty',
28:'to give larger states more Senate votes|because states have different populations|to let the President appoint half the senators',
29:'Mike Kennedy|Sarah McBride|Alexandria Ocasio-Cortez|Hakeem Jeffries|Brian Fitzpatrick',
30:'Nancy Pelosi|Paul Ryan|John Boehner|Kevin McCarthy|Newt Gingrich|Dennis Hastert',
31:'the people of one congressional district|the people of the entire country|only the federal government',
32:'the state governor|the state legislature|the President',
33:'citizens from another state|all citizens of the United States|the people of the whole state',
34:'the state legislature|the President|the Senate',
35:'the state’s land area|the state’s age|the number of counties in the state',
36:'two years|six years|eight years',
37:'because of the 12th Amendment|because of the 25th Amendment|to keep the President in office longer',
38:'Joe Biden|Barack Obama|George W. Bush|Bill Clinton|George H. W. Bush|Ronald Reagan|Jimmy Carter|Gerald Ford',
39:'Kamala Harris|Mike Pence|Tim Kaine|Joe Biden|Dick Cheney|Al Gore',
40:'the Speaker of the House|the President pro tempore of the Senate|the Chief Justice',
41:'writes federal statutes|declares war|decides whether a law is constitutional',
42:'the Secretary of Defense|the Speaker of the House|the Chairman of the Joint Chiefs of Staff',
43:'the Speaker of the House|the Vice President|the Chief Justice',
44:'Congress|the Vice President|the Supreme Court',
45:'the Senate|Congress|the Supreme Court',
46:'Congress|the Supreme Court|state legislatures',
47:'writes laws|commands the military|decides whether laws are constitutional',
48:['Deputy Secretary of State+White House Press Secretary','Assistant Secretary of the Treasury+Deputy Attorney General','Deputy Secretary of Defense+Deputy Secretary of Labor'],
49:'It selects Supreme Court justices|It sets congressional districts|It approves constitutional amendments',
50:'Congress|the Cabinet|state police departments',
51:'writes bills|commands the armed forces|enforces every law',
52:'the U.S. Court of Appeals for the D.C. Circuit|a state supreme court|a federal district court',
53:'five|seven|eleven',54:'four|six|nine',55:'six years|twelve years|eighteen years',
56:'to follow public opinion|to make judges easier to remove|to limit judicial independence',
57:'William Rehnquist|Warren Burger|Earl Warren|Harlan Fiske Stone|Charles Evans Hughes|John Marshall|Roger Taney|Salmon P. Chase',
58:'issue a state driver license|approve a city zoning permit|issue a local building permit',
59:'declare war|make treaties|print paper money',
60:'The federal government receives every remaining power|The amendment abolishes state governments|The amendment establishes a national religion',
61:'Gavin Newsom|Greg Abbott|Jared Polis|Spencer Cox|J.B. Pritzker|Sarah Huckabee Sanders',62:'Denver|Sacramento|Phoenix|Austin|Albany|Boston',
63:'Only landowners may vote|Only men may vote|Citizens must pay a poll tax to vote',
64:'tourists|foreign corporations|people who have not become U.S. citizens',
65:['a right to require an official national religion+a right to silence peaceful criticism+a right to seize property','a right to prevent peaceful assembly+a right to control private beliefs+a right to censor newspapers','a right to ban petitions to government+a right to censor all newspapers+a right to ignore court orders'],
66:'the President|Congress|the Supreme Court',
67:['remain loyal to a foreign government+refuse to obey U.S. laws','reject the Constitution+avoid all civic duties','support a foreign monarch+violate U.S. law'],
68:'purchase citizenship without legal process|receive a state driver license|serve on a jury',
69:['avoid public affairs+refuse to contact officials','ignore elections+prevent others from voting','refuse all community activity+avoid public meetings'],
70:'evade federal taxes|refuse lawful civic duties|damage public property',
71:'because only state governments need money|because federal taxes are voluntary donations|because federal law forbids all private property',
72:'to receive automatic citizenship|to obtain routine employment|to avoid all federal taxes',
73:'to join the 1849 California Gold Rush|to serve in the U.S. Peace Corps|to take part in the Apollo program',
74:'Spanish settlers|British colonists|French explorers',75:'British merchants|European colonists|people from Australia',
76:'the War of 1812|the Civil War|the French and Indian War',
77:'because Britain granted full colonial self-government|to expand the power of the British monarchy|because colonists opposed religious liberty',
78:'George Washington|Alexander Hamilton|James Madison',79:'July 2, 1776|July 4, 1787|June 4, 1776',
80:'the Battle of Gettysburg|the attack on Pearl Harbor|the Battle of Fort Sumter',
81:['Ohio+Kentucky+Tennessee+Maine+Florida','Tennessee+Maine+Florida+California+Texas','Florida+California+Texas+Hawaii+Oregon'],
82:'Articles of Confederation|Declaration of Independence|Bill of Rights',
83:'Thomas Jefferson|John Adams|Patrick Henry',
84:'They opposed ratification of the Constitution|They were amendments to the Constitution|They were written by the President',
85:'commanded the Continental Army|was the first U.S. President|delivered the Gettysburg Address',
86:'wrote the Declaration of Independence|was the 16th President|founded the first free public library',
87:'was the first U.S. President|was the “Father of the Constitution”|led the civil rights movement',
88:'was the first U.S. President|commanded the Continental Army|wrote the Declaration of Independence',
89:'was President during the Civil War|wrote the Declaration of Independence|was the “Father of Our Country”',
90:'Florida Territory|Oregon Country|Alaska',91:'World War I|World War II|Korean War',
92:'War of 1812|Mexican-American War|Spanish-American War',
93:'the Battle of Trenton|the Battle of the Bulge|the Battle of Midway',
94:'was the first President|wrote the Declaration of Independence|commanded the Continental Army in the Revolution',
95:'freed enslaved people in every country|ended slavery in Union states|granted women the right to vote',
96:'World War I|War of 1812|the American Revolution',97:'15th Amendment|19th Amendment|10th Amendment',
98:'1776|1787|1861',99:'Amelia Earhart|Eleanor Roosevelt|Rosa Parks',
100:'the American Revolution|the Civil War|the War of 1812',
101:'because of the attack on Pearl Harbor|to force Iraq out of Kuwait|to respond to the attack on Fort Sumter',
102:'1776|1787|1861',
103:'a period of rapid economic growth|a constitutional amendment|a military conflict',
104:'1918|1945|2008',105:'Herbert Hoover|Harry Truman|Woodrow Wilson',
106:'Germany attacked Pearl Harbor|the United States entered to free Kuwait|the United States entered to fight in Korea',
107:'wrote the Declaration of Independence|was the first President|led the Continental Army in the Revolution',
108:'United Kingdom|France|Canada',109:'restoring feudalism|piracy|the American Civil War',
110:'to force Iraq out of Kuwait|to respond to Pearl Harbor|to stop the spread of fascism in Germany',
111:'to force Iraq out of Kuwait|to respond to the invasion of South Korea|to capture Osama bin Laden',
112:'expanded racial segregation|restored slavery|limited equal protection under law',
113:'was the first U.S. President|commanded the Continental Army|wrote the Declaration of Independence',
114:'to reunite North and South Korea|to remove Japan from China|to defend Pearl Harbor',
115:'the Moon landing|the attack on Pearl Harbor|the end of World War II',
116:'the Korean War|the Vietnam War|the Persian Gulf War (1990–1991)',
117:'Amish|Cajun|Pennsylvania Dutch',
118:'paper|the compass|gunpowder',
119:'Philadelphia|New York City|Boston',
120:'Boston Harbor, Massachusetts|Potomac River, Virginia|San Francisco Bay, California',
121:'the 50 states|the first 13 amendments|the 13 Presidents',
122:'the 13 original colonies|one star for each U.S. territory|the 50 original states',
123:'America the Beautiful|My Country, ’Tis of Thee|God Bless America',
124:'from one, many separate parts|everyone remains separate|many become many, not one',
125:'a holiday honoring military veterans|a holiday commemorating the Constitution|a holiday marking the end of the Civil War',
126:['Texas Independence Day+Patriots’ Day+César Chávez Day','César Chávez Day+Confederate Memorial Day+Alaska Day','Alaska Day+Texas Independence Day+Patriots’ Day'],
127:'a holiday honoring all living veterans|a holiday celebrating independence from Britain|a holiday honoring the Constitution',
128:'a holiday solely for soldiers who died in service|a holiday celebrating independence from Britain|a holiday honoring the Constitution',
}
}

def norm(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','',s)

def curated_sets(year, number, required):
    authored=CURATED[year][number]
    if isinstance(authored, list): raw=[x.split('+') if isinstance(x,str) else x for x in authored]
    elif required==1: raw=[[x] for x in authored.split('|')]
    else: raw=[x.split('+') for x in authored.split('|')]
    if len(raw)<3 or any(len(x)!=required for x in raw):
        raise ValueError(f'Invalid authored distractors for {year} Q{number}: {raw}')
    return raw

def optional_variants(value, allow_bare_number=False, include_years=False):
    """Expand USCIS parenthetical optional words and numeric word/digit forms."""
    variants={value.strip()}
    number_words={'zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty-one','thirty-two','thirty-three','thirty-four','thirty-five','thirty-six','thirty-seven','thirty-eight','thirty-nine'}
    # Numeric parentheticals present two interchangeable spellings, not an
    # optional phrase to append: eighteen (18) yields eighteen or 18.
    while any(re.search(r'\(\d+\)',s) for s in variants):
        expanded=set()
        for s in variants:
            m=re.search(r'\((\d+)\)',s)
            if not m:
                expanded.add(s); continue
            prefix=s[:m.start()]; words=list(re.finditer(r'\S+',prefix)); start=len(words)
            while start and words[start-1].group().strip('.,').lower() in number_words: start-=1
            if start and words[start-1].group().strip('.,').lower()=='and' and start>1 and words[start-2].group().strip('.,').lower() in {'hundred','thousand'}:
                start-=1
                while start and words[start-1].group().strip('.,').lower() in number_words: start-=1
            begin=words[start].start() if start<len(words) else m.start()
            expanded.add((s[:m.start()]+s[m.end():]).strip())
            if begin<m.start(): expanded.add((s[:begin]+m.group(1)+s[m.end():]).strip())
        variants={re.sub(r'\s+',' ',x).strip(' ,') for x in expanded if x.strip(' ,')}
    # Remaining parentheses are USCIS optional wording.
    while any(re.search(r'\([^()]+\)',s) for s in variants):
        expanded=set()
        for s in variants:
            m=re.search(r'\s*\(([^()]*)\)',s)
            if not m:
                expanded.add(s); continue
            expanded.add((s[:m.start()]+s[m.end():]).strip())
            expanded.add((s[:m.start()]+' '+m.group(1)+s[m.end():]).strip())
        variants={re.sub(r'\s+',' ',x).strip(' ,') for x in expanded if x.strip(' ,')}
    if value.lower().startswith('the '): variants.add(value[4:].strip())
    elif value.lower().startswith('a '): variants.add(value[2:].strip())
    elif value.lower().startswith('an '): variants.add(value[3:].strip())
    numeric=re.search(r'([^()]+?)\s*\((\d+)\)',value)
    if numeric and allow_bare_number:
        before,digits=numeric.groups(); tokens=before.strip().split(); suffix=[]
        while tokens and tokens[-1].strip('.,').lower() in number_words: suffix.insert(0,tokens.pop())
        if tokens and tokens[-1].strip('.,').lower()=='and' and tokens[-2].strip('.,').lower() in {'hundred','thousand'}:
            suffix.insert(0,tokens.pop())
            while tokens and tokens[-1].strip('.,').lower() in number_words: suffix.insert(0,tokens.pop())
        word=' '.join(suffix)
        if word:
            variants.update({word,digits})
            tail=value[value.find(')')+1:].strip()
            if re.match(r'^(years?|and older|or older|and above)',tail,re.I):
                variants.update({word+' '+tail,digits+' '+tail})
            if include_years:
                variants.update({word+' years',digits+' years',word+' year',digits+' year'})
    explicit={
        norm('resolves disputes (disagreements)'):['resolves disagreements'],
        norm('resolves disputes (disagreements) about the law'):['resolves disagreements about the law'],
        norm('saved (or preserved) the Union'):['preserved the Union'],
        norm('freed the slaves (Emancipation Proclamation)'):['Emancipation Proclamation'],
        norm('Automobile (cars, internal combustion engine)'):['Automobile','cars','internal combustion engine'],
        norm('Presidents Day (Washington’s Birthday)'):['Washington’s Birthday','Washington\'s Birthday'],
    }
    variants.update(explicit.get(norm(value),[]))
    bad={
        norm('resolves disputes (disagreements)'):{norm('resolves disputes disagreements')},
        norm('resolves disputes (disagreements) about the law'):{norm('Resolves disputes disagreements about the law')},
        norm('because of high taxes (taxation without representation)'):{norm('because of high taxes taxation without representation')},
        norm('because the British army stayed in their houses (boarding, quartering)'):{norm('because the British army stayed in their houses boarding, quartering')},
        norm('Presidents Day (Washington’s Birthday)'):{norm('Presidents Day Washington’s Birthday')},
        norm('freed the slaves (Emancipation Proclamation)'):{norm('freed the slaves Emancipation Proclamation')},
        norm('Automobile (cars, internal combustion engine)'):{norm('Automobile cars, internal combustion engine')},
        norm('British soldiers stayed in Americans’ houses (boarding, quartering)'):{norm('British soldiers stayed in Americans’ houses boarding, quartering')},
        norm('Intolerable (Coercive) Acts'):{norm('Intolerable Coercive Acts')},
        norm('Boston Tea Party (Tea Act)'):{norm('Boston Tea Party Tea Act')},
        norm('Washington Crossing the Delaware (Battle of Trenton)'):{norm('Washington Crossing the Delaware Battle of Trenton')},
        norm('Doubled the size of the United States (Louisiana Purchase)'):{norm('Doubled the size of the United States Louisiana Purchase')},
        norm('President at the end of (during) the Korean War'):{norm('President at the end of during the Korean War')},
        norm('Integrated circuit (IC)'):{norm('Integrated circuit IC')},
    }
    variants={v for v in variants if norm(v) not in bad.get(norm(value),set())}
    if norm(value)=='worldwari': variants.update({'WWI','World War One','First World War'})
    if norm(value)=='worldwarii': variants.update({'WWII','World War Two','Second World War'})
    return sorted({re.sub(r'\s+',' ',x).strip(' ,') for x in variants if x.strip(' ,')}-{value},key=lambda x:(len(x),x))

def rationale_for(q, accepted, sets):
    y=q['edition_id'][-4:]; n=q['official_number']; t=q['question_text'].lower()
    custom={
      ('2008',2):'The Constitution establishes and defines the federal government and protects basic rights. The distractors assign it unrelated operational tasks; it does not appoint state governors, set the annual tax filing date, or directly elect the President.',
      ('2008',4):'An amendment changes or adds to the Constitution. A court ruling, executive order, and ordinary statute may affect government but none is an amendment to the Constitution.',
      ('2008',6):'The First Amendment protects religion, speech, press, assembly, and petition. Requiring a national religion or suppressing peaceful speech or assembly reverses those protections.',
      ('2008',9):'The Declaration names life, liberty, and pursuit of happiness. The proposed pairs substitute later constitutional rights or other civic rights for those stated principles.',
      ('2008',13):'The answers must name a governmental branch or governmental component. A newspaper, private company, or political party is an outside organization, not a branch or part of government.',
      ('2008',14):'Checks and balances and separation of powers limit concentration of authority. The proposed systems concentrate power in one person, branch, or inherited office.',
      ('2008',17):'Congress consists of the Senate and House of Representatives. The proposed pairs name executive or judicial offices/courts, not the two chambers of Congress.',
      ('2008',41):'A state driver license, city zoning approval, and local building permit are government powers exercised by state/local authorities, not federal powers.',
      ('2008',42):'Declaring war, making treaties, and printing money are federal powers; they are not powers reserved to the states in the USCIS answer list.',
      ('2008',48):'The voting amendments prohibit voting restrictions based on race, sex, age at least 18, or poll taxes. The proposed restrictions contradict those protections.',
      ('2008',49):'Paying taxes, attending school, and military service are not limited to U.S. citizens; jury service and voting in federal elections are citizen-only responsibilities in this answer bank.',
      ('2008',50):'Speech, religion, and bearing arms are rights held by people living in the United States, not rights reserved only to citizens.',
      ('2008',51):'The named freedoms are protections for people living in the United States. The proposed powers to censor, impose religion, or suppress peaceful activity are not protected rights.',
      ('2008',55):'Democratic participation consists of constructive civic actions. Withdrawing from public affairs or preventing voting does not participate in democracy.',
      ('2008',59):'Before European arrival, the people in America were Indigenous peoples; Spanish settlers, British colonists, and French explorers were European arrivals, not pre-contact inhabitants.',
      ('2008',60):'The answer refers to Africans forcibly transported and sold into slavery in America; merchants and European colonists were not the people described by that question.',
      ('2008',63):'The Declaration was adopted on July 4, 1776. The distractors change the day or year, so none states the full adoption date.',
      ('2008',64):'The listed original states were among the thirteen colonies that formed the original states. Ohio, Kentucky, Tennessee, Maine, Florida, California, Texas, and Hawaii entered the Union later.',
      ('2008',81):'Britain, France, the Soviet Union, China, Australia, and Canada fought alongside the United States as Allied powers, not against it.',
      ('2008',87):'Amish, Cajun, and Pennsylvania Dutch communities are not American Indian tribes; the question asks for a tribal nation, not a U.S. cultural or religious community.',
      ('2025',2):'The U.S. Constitution is the supreme law. The other named founding documents are important but do not hold that legal status.',
      ('2025',4):'“We the People” expresses popular self-government and consent. The distractors deny public authority or substitute rule by a monarch.',
      ('2025',10):'The Declaration and Constitution express equality, liberty, natural rights, social contract, limited government, and self-government. Divine-right monarchy and unlimited inherited authority contradict those principles.',
      ('2025',14):'The listed historical documents influenced the Constitution. The Emancipation Proclamation, Gettysburg Address, Civil Rights Act, and Federal Highway Act were later documents and did not influence its drafting.',
      ('2025',16):'The three constitutional branches are legislative, executive, and judicial. Military, economic, and diplomatic functions are not additional constitutional branches.',
      ('2025',19):'Congress has two chambers, the Senate and House. The proposed pairs combine other government institutions that are not congressional chambers.',
      ('2025',26):'House members face voters more frequently, which lets representation follow public opinion more closely. The distractors claim the House cannot legislate or that members serve for life.',
      ('2025',28):'Each state has two senators to provide equal state representation, including for smaller states; population does not set a state’s Senate seat count.',
      ('2025',48):'Cabinet-level positions are department heads and other principal officers. The listed deputy, press, and staff jobs are subordinate or support roles, not Cabinet-level posts.',
      ('2025',58):'State driver licensing, city zoning, and local building permits are state/local powers, not powers assigned only to the federal government.',
      ('2025',59):'Declaring war, making treaties, and issuing national currency are federal powers, not state-only powers.',
      ('2025',60):'The Tenth Amendment reserves powers not delegated to the United States to the states or the people; it does not grant every power to the federal government or abolish states.',
      ('2025',63):'The voting amendments prohibit race- and sex-based exclusions and poll taxes, and protect voting rights for citizens at least 18. The proposed restrictions directly contradict those amendments.',
      ('2025',64):'The question asks who has the combined federal election, federal office, and jury eligibility identified in the study answer: U.S. citizens. Tourists, corporations, and noncitizens do not meet that description.',
      ('2025',65):'The listed freedoms are rights of people living in the United States. The proposed powers to censor, impose religion, seize property, or ignore court orders are not such rights.',
      ('2025',67):'The Oath promises loyalty to the United States, support for the Constitution and laws, and service if needed. The proposed promises reverse those commitments.',
      ('2025',68):'Citizenship is acquired by birth under constitutional conditions, naturalization, or derivation under law. A driver license or jury service does not confer citizenship.',
      ('2025',69):'Voting, contacting officials, campaigning, and civic-group activity are forms of participation. Avoiding public affairs or obstructing voting is not participation.',
      ('2025',70):'Serving the country includes civic and public service. Evading taxes, refusing lawful duties, and damaging public property do not serve the country.',
      ('2025',74):'Before European arrival, America was inhabited by American Indians/Native Americans; European settlers and explorers arrived later.',
      ('2025',75):'The answer identifies Africans forcibly transported and sold as slaves in America. The other groups are not the people described in the question.',
      ('2025',79):'The Declaration was adopted July 4, 1776; each distractor changes the exact month or year.',
      ('2025',81):'The five selected states must come from the thirteen original states. Ohio, Kentucky, Tennessee, Maine, Florida, California, Texas, and Hawaii became states later.',
      ('2025',97):'The Fourteenth Amendment defines citizenship for persons born or naturalized in the United States; the Fifteenth, Nineteenth, and Tenth Amendments address different subjects.',
      ('2025',98):'The Fifteenth Amendment and Reconstruction established voting rights for men regardless of race after the Civil War; 1776, 1787, and 1861 all predate that amendment.',
      ('2025',102):'Women gained constitutional voting protection in 1920 under the Nineteenth Amendment; 1776, 1787, and 1861 all predate that protection.',
      ('2025',106):'The United States entered World War II after Japan attacked Pearl Harbor and through its conflict with the Axis; the distractors mix causes from other wars.',
      ('2025',114):'The Persian Gulf War response forced Iraqi forces out of Kuwait; Korea, China, and Pearl Harbor refer to different conflicts.',
      ('2025',117):'Amish, Cajun, and Pennsylvania Dutch communities are not American Indian tribes; each is a different cultural or religious community.',
      ('2025',118):'Paper, the compass, and gunpowder originated in China, so they are not American innovations. The linked Smithsonian source documents their Chinese origins.',
      ('2025',121):'The thirteen stripes represent the original colonies, not states, amendments, or Presidents.',
      ('2025',122):'The fifty stars represent the fifty states; the original colonies numbered thirteen and U.S. territories do not each have a flag star.',
      ('2025',124):'“E Pluribus Unum” means “Out of many, one.” The distractors reverse that relationship or replace the Latin motto with a different idea.',
      ('2025',126):'The listed federal national holidays are the accepted set; the distractors are state or local observances, not national U.S. holidays.',
      ('2025',127):'Memorial Day honors service members who died in military service; Veterans Day honors people who served, and Independence Day marks independence.',
      ('2025',128):'Veterans Day honors people who serve or have served in the military; remembrance of those who died is Memorial Day.',
    }
    custom.update({
      ('2008',1):'The Constitution, not the Declaration, Confederation-era Articles, or ratification essays, is the supreme law.',
      ('2008',3):'None of the quotations is the Constitution’s first three words, which are “We the People.”',
      ('2008',5):'The first ten constitutional amendments are called the Bill of Rights; the alternatives are separate founding documents.',
      ('2008',7):'The Constitution has 27 amendments; 10 is the number in the Bill of Rights, while 21 and 26 are other amendment numbers.',
      ('2008',8):'The Declaration announced independence from Britain; it did not create the later federal government, amendments, or tax system.',
      ('2008',10):'Religious freedom protects the choice to practice any religion or none; government compulsion and limits on private practice contradict that freedom.',
      ('2008',11):'The U.S. economy is capitalist/market based; command, feudal, and barter-only systems describe different economic structures.',
      ('2008',12):'Rule of law binds leaders and government to law; the alternatives explicitly exempt officials or citizens from that principle.',
      ('2008',15):'The executive branch is led by the President, not by the legislative Speaker, Chief Justice, or Secretary of State.',
      ('2008',16):'Federal laws are made by Congress; the executive and judicial branches do not enact federal statutes.',
      ('2008',18):'The Senate has 100 seats. Fifty is the number of states; 435 is the House voting-member count.',
      ('2008',19):'A U.S. senator serves a six-year term; two and four years are other elected-office terms.',
      ('2008',21):'The House has 435 voting members; 100 is the Senate count and 50 is the number of states.',
      ('2008',22):'A House member serves a two-year term; the other durations do not match the constitutional House term.',
      ('2008',24):'A U.S. senator represents all people of that state, not one district, only the federal government, or the whole nation.',
      ('2008',25):'House seats are apportioned by population; land area, state age, and county count do not determine the number of representatives.',
      ('2008',26):'The President serves a four-year term; two, six, and eight years are different durations.',
      ('2008',27):'Federal presidential elections are held in November, not January, May, or September.',
      ('2008',30):'The Vice President succeeds the President when the President cannot serve; the distractors are not first in the succession rule.',
      ('2008',31):'When both President and Vice President cannot serve, the Speaker is next in the succession order; the other offices are not next.',
      ('2008',32):'The President is Commander in Chief; the Secretary of Defense and military chair advise or administer but do not hold that constitutional role.',
      ('2008',33):'The President signs bills into law; the Speaker, Vice President, and Chief Justice do not sign federal bills into law.',
      ('2008',34):'The President vetoes bills; Congress, the Vice President, and Supreme Court do not exercise the presidential veto.',
      ('2008',35):'The Cabinet advises the President; commanding the military, judicial review, and writing statutes belong to other functions.',
      ('2008',37):'The judicial branch reviews and interprets law; it does not write statutes, command the military, or veto bills.',
      ('2008',38):'The U.S. Supreme Court is the nation’s highest court; circuit, state, and district courts are lower courts.',
      ('2008',39):'Nine justices sit on the Supreme Court; five, seven, and eleven are not its membership count.',
      ('2008',52):'The Pledge is loyalty to the United States or its flag, not to an officeholder or Congress.',
      ('2008',53):'The Oath includes loyalty, obeying and defending U.S. law and service if needed; employment, annual jury duty, and mandatory voting are not its promises.',
      ('2008',54):'Citizens may vote for President at 18; 16 is too young, while 21 and 25 are not the voting age.',
      ('2008',56):'April 15 is the standard federal individual return deadline; May 15, September 30, and December 31 are not the standard filing date.',
      ('2008',57):'Selective Service registration applies at 18 or between 18 and 26; 16, 30, and 35 fall outside that stated range.',
      ('2008',58):'The California Gold Rush, Peace Corps, and Apollo program arose long after colonial settlement; none could have motivated colonists to come to America.',
      ('2008',61):'Colonists fought over British taxation, quartering, and lack of self-government; the distractors reverse those grievances or claim support for monarchy.',
      ('2008',62):'Thomas Jefferson wrote the Declaration; Washington, Hamilton, and Madison were not its author.',
      ('2008',65):'The Constitutional Convention produced the Constitution, not the Declaration, Bill of Rights, or Articles of Confederation.',
      ('2008',66):'The Constitution was written in 1787; 1776 marks independence and 1781/1789 refer to different milestones.',
      ('2008',67):'Madison, Hamilton, and Jay wrote the Federalist Papers; Jefferson, Adams, and Henry were not the listed authors.',
      ('2008',68):'The stated achievements are Franklin’s public service, diplomacy, writing, and library work; he was neither President nor Army commander nor Chief Justice.',
      ('2008',69):'George Washington is called the Father of Our Country; Jefferson, Adams, and Franklin do not hold that title.',
      ('2008',70):'George Washington was the first President; Adams, Jefferson, and Madison served later.',
      ('2008',71):'The 1803 purchase from France was Louisiana; Florida, Oregon Country, and Alaska were acquired by other means or at other times.',
      ('2008',72):'The requested wars occurred in the 1800s; World War I, World War II, and Korea occurred in the 1900s.',
      ('2008',73):'The Civil War was the North–South war; the War of 1812, Mexican-American War, and Spanish-American War were different conflicts.',
      ('2008',74):'World War I, the Great Depression, and the Cold War all occurred after the Civil War began, so they could not have caused it.',
      ('2008',75):'Lincoln freed enslaved people, preserved the Union, and led during the Civil War; he did not write the Declaration or make the Louisiana Purchase.',
      ('2008',76):'The Emancipation Proclamation applied to enslaved people in rebelling Confederate areas; it did not abolish slavery worldwide or grant women suffrage.',
      ('2008',77):'Susan B. Anthony advocated women’s and civil rights; she was not President, Army commander, or author of the Constitution.',
      ('2008',78):'The question asks for a 1900s war; the American Revolution, Civil War, and War of 1812 occurred earlier.',
      ('2008',79):'Woodrow Wilson was President during World War I; Taft, Franklin Roosevelt, and Harding served at other times.',
      ('2008',80):'Franklin Roosevelt was President during the Depression and World War II; Hoover, Truman, and Coolidge do not match both periods.',
      ('2008',82):'Eisenhower served as a general in World War II; he was not in World War I, Korea, or the Spanish-American War.',
      ('2008',83):'The U.S. Cold War concern was communism; feudalism, Atlantic piracy, and colonial restoration were not the conflict’s central concern.',
      ('2008',84):'Temperance, conservation, and antitrust movements pursued different reforms; they were not the movement whose stated goal was ending racial discrimination.',
      ('2008',85):'Martin Luther King Jr. fought for civil rights and equality; he was not President, a Revolutionary general, or Declaration author.',
      ('2008',86):'On September 11, 2001, terrorists attacked the United States; the distractors describe unrelated events from other dates.',
      ('2008',88):'The Missouri and Mississippi are the two longest U.S. rivers; the Colorado, Ohio, and Rio Grande are shorter.',
      ('2008',89):'The Pacific borders the West Coast; the Atlantic, Indian, and Arctic Oceans do not.',
      ('2008',90):'The Atlantic borders the East Coast; the Pacific, Indian, and Arctic Oceans do not.',
      ('2008',91):'Hawaii and California are states and Ontario is Canadian; none is a U.S. territory.',
      ('2008',92):'Florida, Texas, and Hawaii do not border Canada; the U.S.–Canada border states are farther north.',
      ('2008',93):'Oklahoma, Colorado, and Nevada do not border Mexico; the four border states are California, Arizona, New Mexico, and Texas.',
      ('2008',94):'Washington, D.C. is the national capital; Philadelphia, New York, and Boston were not selected as the capital.',
      ('2008',95):'The Statue of Liberty stands in New York Harbor on Liberty Island; the listed West Coast, Boston, and Potomac sites are elsewhere.',
      ('2008',96):'The thirteen stripes represent the original colonies, not fifty states, amendments, or Presidents.',
      ('2008',97):'The fifty stars correspond to the fifty states, not colonies, territories, or original states.',
      ('2008',98):'The national anthem is “The Star-Spangled Banner”; the distractors are other patriotic songs or symbols.',
      ('2008',99):'Independence Day is celebrated July 4, not November 11, January 1, or May 1.',
      ('2025',1):'The United States is a constitutional federal republic and representative democracy; monarchy and dictatorship place authority in a ruler or unelected regime.',
      ('2025',3):'The Constitution forms government, defines its powers and parts, and protects rights; setting the tax date, electing governors, and naming the anthem are not its functions.',
      ('2025',5):'Constitutional changes are made through amendments; an executive order, court ruling, or ordinary statute is not an amendment.',
      ('2025',6):'The Bill of Rights protects basic rights, not the powers of Congress, governor terms, or judicial terms.',
      ('2025',7):'The Constitution has 27 amendments; ten is the Bill of Rights count, not the total.',
      ('2025',8):'The Declaration states independence and inherent equality/rights; it did not establish a monarchy or create the later federal government.',
      ('2025',9):'The Declaration of Independence declared the colonies free from Britain; the Constitution, Articles, and Federalist Papers serve different roles.',
      ('2025',11):'The phrase “Life, Liberty, and the pursuit of Happiness” is in the Declaration of Independence, not the other founding documents.',
      ('2025',12):'The U.S. uses capitalism/free markets; command, feudal, and barter-only systems are different economic arrangements.',
      ('2025',13):'Rule of law means everyone, including leaders and government, must obey law; the distractors expressly exempt officials.',
      ('2025',15):'Branches prevent concentration of power through checks and balances and separation of powers; the distractors describe concentration or exclusion.',
      ('2025',17):'The President leads the executive branch, not the legislative, judicial, or military organization.',
      ('2025',18):'Congress and the legislative branch write federal laws; the President, Supreme Court, and Cabinet do not enact them.',
      ('2025',20):'Congress writes laws, declares war, and sets the federal budget; vetoing, military command, and constitutional review belong elsewhere.',
      ('2025',21):'There are 100 U.S. senators; 50 is the state count and 435 is the House count.',
      ('2025',22):'A senator serves six years; two, four, and eight years are not the Senate term.',
      ('2025',24):'The House has 435 voting members; 100 is the Senate count and 50 is the number of states.',
      ('2025',25):'A House term is two years; the other durations are not the House term.',
      ('2025',27):'Each state has two senators, not one, three, or fifty.',
      ('2025',29):'The question asks for the representative of the selected district; a senator or governor is a different office.',
      ('2025',30):'Mike Johnson is the current Speaker; the named former Speakers no longer hold that office.',
      ('2025',31):'A senator represents the citizens or people of their state, not one district or the entire nation.',
      ('2025',32):'U.S. senators are elected by citizens of their state, not appointed by governors, legislatures, or the President.',
      ('2025',33):'A House member represents citizens/people in that congressional district, not people from another state or the whole country.',
      ('2025',34):'Citizens of the district elect its House member; governors, Presidents, and the Senate do not elect that representative.',
      ('2025',35):'House representation is apportioned by population; land area, age, and county count do not determine House seats.',
      ('2025',36):'The President is elected for a four-year term; two, six, and eight years are incorrect durations.',
      ('2025',37):'The Twenty-second Amendment limits presidential terms; the Twelfth and Twenty-fifth address different matters.',
      ('2025',40):'The Vice President is next in succession; the Speaker and other officers follow later, and the Chief Justice is not in the line.',
      ('2025',41):'The President signs/vetoes bills, enforces laws, commands the military, conducts diplomacy, and appoints judges; writing laws and declaring war are assigned elsewhere.',
      ('2025',42):'The President is Commander in Chief; military department and congressional leaders do not hold that constitutional role.',
      ('2025',43):'The President signs bills; the Speaker, Vice President, and Chief Justice do not sign them into law.',
      ('2025',44):'The President vetoes bills; Congress, Vice President, and Supreme Court do not exercise the presidential veto.',
      ('2025',45):'The President appoints federal judges, subject to Senate confirmation; the Senate does not originate the appointment.',
      ('2025',46):'The executive branch includes the President, Cabinet, and federal agencies; Congress, courts, and state legislatures are not its parts.',
      ('2025',47):'The Cabinet advises the President; it does not write laws, command the armed forces, or decide constitutionality.',
      ('2025',49):'The Electoral College participates in choosing the President; it does not appoint justices, draw districts, or amend the Constitution.',
      ('2025',50):'The Supreme Court and federal courts are parts of the judicial branch; Congress, Cabinet, and police departments are not.',
      ('2025',51):'The judiciary reviews/explains law, resolves disputes, and assesses constitutionality; legislating, commanding, and executing laws are other branches’ functions.',
      ('2025',52):'The U.S. Supreme Court is the highest court nationally; federal appellate, district, and state courts are lower in their respective systems.',
      ('2025',53):'The Supreme Court has nine seats; five, seven, and eleven are incorrect counts.',
      ('2025',54):'Five justices are usually needed to decide a case; four, six, and nine are not the usual threshold.',
      ('2025',55):'Justices serve for life or until retirement; six-, twelve-, and eighteen-year terms would impose fixed terms.',
      ('2025',56):'Life tenure protects judicial independence and limits outside political influence; the distractors describe the opposite purpose.',
      ('2025',71):'Federal taxes are legally required and fund the federal government; the distractors wrongly limit the obligation or purpose.',
      ('2025',72):'Selective Service registration is required by law, civic duty, and draft fairness; it does not grant citizenship, employment, or tax exemption.',
      ('2025',73):'The California Gold Rush, Peace Corps, and Apollo program arose long after colonial settlement; none could have motivated colonists to come to America.',
      ('2025',76):'The American Revolution was the war for independence from Britain; the War of 1812 and Civil War had different causes and aims.',
      ('2025',77):'Taxation without representation, quartering, and lack of self-government were grievances; Britain did not grant the rights asserted in the distractors.',
      ('2025',78):'Thomas Jefferson wrote the Declaration; Washington, Hamilton, and Madison were not its author.',
      ('2025',80):'The Revolution’s events include Bunker Hill, Saratoga, Trenton, and Yorktown; Gettysburg, Pearl Harbor, and Fort Sumter belong to other conflicts.',
      ('2025',82):'The Constitution was written in 1787. The Articles and Declaration predate it, while the Bill of Rights was ratified in 1791.',
      ('2025',83):'Madison, Hamilton, and Jay wrote the Federalist Papers; Jefferson, Adams, and Henry were not among the named authors.',
      ('2025',84):'The Federalist Papers explained and supported ratification; they were not amendments, anti-ratification essays, or presidential writings.',
      ('2025',85):'Franklin’s listed achievements include public libraries, postmaster service, diplomacy, and inventions; command of the Continental Army and the first presidency were Washington’s, and Lincoln delivered the Gettysburg Address.',
      ('2025',86):'Washington was Father of Our Country, first President, Continental Army general, and Convention president; the distractors assign other founders’ achievements.',
      ('2025',87):'Jefferson wrote the Declaration, was third President, and made the Louisiana Purchase; the alternatives identify Washington, Madison, and King.',
      ('2025',88):'Madison was Father of the Constitution, fourth President, War of 1812 President, and Federalist writer; the alternatives describe other founders.',
      ('2025',89):'Hamilton served as Treasury Secretary, Federalist writer, bank founder, and Washington aide; the distractors assign him other founders’ roles.',
      ('2025',90):'The Louisiana Purchase was territory acquired from France in 1803; Florida, Oregon, and Alaska came from other acquisitions.',
      ('2025',91):'The requested conflicts occurred in the 1800s; the world wars and Korean War occurred in the 1900s.',
      ('2025',92):'The Civil War was the North–South war; the other wars had different opponents and periods.',
      ('2025',93):'The Battle of Trenton was in the Revolution, and Midway and the Bulge were World War II battles; none was a Civil War event.',
      ('2025',94):'Lincoln freed enslaved people, preserved the Union, led during the Civil War, and delivered the Gettysburg Address; the alternatives identify other founders.',
      ('2025',95):'The Proclamation freed enslaved people in rebelling Confederate areas, not worldwide, in loyal Union states, or by granting suffrage.',
      ('2025',96):'The Civil War ended slavery; the Revolution, War of 1812, and World War I did not.',
      ('2025',99):'The question asks for 19th-century women’s rights leaders; the alternatives are 20th-century public figures.',
      ('2025',100):'The listed conflicts are from the 1900s; the Revolution, Civil War, and War of 1812 occurred earlier.',
      ('2025',101):'The U.S. entered World War I after German attacks and to support the Allies/oppose Central Powers; Pearl Harbor and the other wars are unrelated.',
      ('2025',103):'The Great Depression was a severe, prolonged economic downturn, not a war, constitutional amendment, or period of rapid growth.',
      ('2025',104):'The Great Depression began with the 1929 crash; 1918, 1945, and 2008 are different dates/crises.',
      ('2025',105):'Franklin Roosevelt was President during the Great Depression and World War II; Hoover, Truman, and Wilson do not span both.',
      ('2025',107):'Eisenhower was a World War II general and later President; the distractors assign him achievements of Jefferson and Washington.',
      ('2025',108):'The Soviet Union was the main Cold War rival; Britain, France, and Canada were U.S. allies.',
      ('2025',109):'The question concerns U.S. Cold War priorities; restoring feudalism, piracy, and the American Civil War are not Cold War concerns.',
      ('2025',110):'The U.S. entered the Korean War to stop communism’s spread; Iraq/Kuwait and Pearl Harbor are different conflicts.',
      ('2025',111):'The stated U.S. rationale for entering Vietnam was containing communism; the distractors refer to the Gulf War, Korea, and post-9/11 operations.',
      ('2025',112):'The civil rights movement fought racial discrimination; the distractors describe extending discrimination or slavery.',
      ('2025',115):'September 11, 2001 was the terrorist attack on the United States; the other choices occurred at different times.',
      ('2025',116):'The accepted examples are conflicts after September 11, 2001. Korea, Vietnam, and the 1990–1991 Persian Gulf War all predate those attacks.',
      ('2025',119):'Washington, D.C. is the U.S. capital; Philadelphia, New York, and Boston are not the current national capital.',
      ('2025',120):'The Statue of Liberty is in New York Harbor/Liberty Island; the distractors place it in other regions.',
      ('2025',123):'The national anthem is “The Star-Spangled Banner”; the alternatives are other patriotic songs or symbols.',
      ('2025',125):'Independence Day celebrates independence from Britain and the country’s birthday; the distractors describe other commemorations.',
      ('2008',36):'The accepted titles are Cabinet-level department heads or officers; the listed deputies, press secretary, and staff roles are subordinate support jobs.',
      ('2008',45):'The Democratic and Republican parties are the two major U.S. parties; the Green, Libertarian, Constitution, and Working Families parties are smaller third parties.',
      ('2008',100):'The accepted options are national federal holidays; Texas Independence Day, Patriots’ Day, César Chávez Day, Confederate Memorial Day, and Alaska Day are regional observances.',
      ('2025',66):'The Pledge expresses loyalty to the United States or its flag; it does not pledge allegiance to elected officials or a branch of government.',
      ('2025',113):'King’s recognized work was civil rights and equality; the distractors assign him roles associated with Washington, Jefferson, or Franklin.',
    })
    answer_text='; '.join(accepted) if accepted else 'the current official answer for this jurisdiction'
    if (y,n) in custom: return custom[(y,n)]
    if q['geographic_scope']!='national':
        office=q.get('office_or_dependency')
        if office=='us_senator': return 'The named people hold U.S. Senate seats for other states; none is a senator representing the selected state. Runtime adds and filters current senators from other jurisdictions.'
        if office=='us_representative': return 'The named people represent other congressional districts; none represents the selected district. Runtime adds and filters current House members from other districts.'
        if office=='state_governor': return 'The named people govern other states; none is governor of the selected state. Runtime adds and filters current governors from other jurisdictions.'
        return 'The named cities are capitals of other states, not the selected state’s capital. Runtime adds and filters capital values for the other jurisdictions.'
    if n in DYNAMIC_NATIONAL[y]:
        if 'president' in q['question_text'].lower() and 'vice' not in q['question_text'].lower(): return 'The named former Presidents no longer hold the current office; the active national answer row supplies the accepted current name and its reviewed name variants.'
        if 'vice president' in q['question_text'].lower(): return 'The named people are former Vice Presidents; the active national answer row supplies only the current officeholder and reviewed name variants.'
        if 'chief justice' in q['question_text'].lower(): return 'The named people are former Chief Justices or other justices; the active national answer row supplies only the current Chief Justice and reviewed name variants.'
        if 'speaker' in q['question_text'].lower(): return 'The named people are former Speakers; the active national answer row supplies only the current Speaker and reviewed name variants.'
        return 'The named choices are other parties, not the current President’s party; the current national answer row supplies the accepted party and its reviewed variant.'
    raise ValueError(f'Missing question-specific wrongness rationale for {y} Q{n}')

def build():
    catalogue={'content_version':VERSION,'editions':{}}
    reports=[]
    for year in ('2008','2025'):
        bank=json.loads((RESEARCH/f'answers-{year}.json').read_text())
        rows=[]
        for q in bank['questions']:
            n=q['official_number']; answers=q['current_answer'].get('options') or []
            req=REQUIRED.get((year,n),1)
            geo=n in GEO_QUESTIONS[year]
            dynamic_national=n in DYNAMIC_NATIONAL[year]
            prompt=q['question_text'].lower()
            numeric_context=any(w in prompt for w in ['how many','how old','how long','how much'])
            years_context='year' in prompt or 'term' in prompt
            if (year,n) in FIXED_GROUPS:
                groups=[{'key':k,'display':d,'aliases':a} for k,d,a in FIXED_GROUPS[(year,n)]]
            elif geo or dynamic_national:
                groups=[]
            elif (year,n)==('2008',8):
                groups=[{'key':'independence','display':answers[0],'aliases':list(dict.fromkeys([*answers[1:],*[v for a in answers for v in optional_variants(a,numeric_context,years_context)]]))}]
            elif (year,n)==('2008',73):
                groups=[{'key':'civil-war','display':'the Civil War','aliases':['the War between the States','Civil War','War between the States']}]
            elif (year,n)==('2025',48):
                groups=[]
                defense={'key':'secretary-defense','display':'Secretary of Defense','aliases':['Secretary of War','Secretary of War (Defense)','Defense Secretary']}
                seen_defense=False
                for i,a in enumerate(answers):
                    if 'Secretary of War (Defense)' in a or a=='Secretary of Defense':
                        if not seen_defense: groups.append(defense); seen_defense=True
                        else: defense['aliases'].append(a)
                        continue
                    groups.append({'key':f'a{i+1}','display':a,'aliases':optional_variants(a,numeric_context,years_context)})
            else:
                groups=[]; by_norm={}
                for i,a in enumerate(answers):
                    k=norm(a)
                    if k in by_norm:
                        groups[by_norm[k]]['aliases'].append(a)
                    else:
                        # Strip instructional parentheses only in display for common numeric answers.
                        display=a
                        aliases=optional_variants(a,numeric_context,years_context)
                        groups.append({'key':f'a{i+1}','display':display,'aliases':list(dict.fromkeys(aliases))}); by_norm[k]=len(groups)-1
            if (year,n)==('2025',97):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'Fourteenth Amendment','14th']))
            if (year,n) in {('2008',63),('2025',79)}:
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'July 4th, 1776','4 July 1776','July Fourth, 1776']))
            if (year,n)==('2008',99):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'July 4th','4 July','Fourth of July']))
            if (year,n)==('2008',56):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'April 15th','15 April']))
            if (year,n)==('2008',57):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'18','eighteen']))
            if (year,n) in {('2008',94),('2025',119)}:
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'Washington DC','Washington D.C.','Washington D C']))
            if (year,n)==('2008',100):
                for g in groups:
                    name=norm(g['display'])
                    if name=='thanksgiving': g['aliases'].append('Thanksgiving Day')
                    if name=='christmas': g['aliases'].append('Christmas Day')
                    if name=='presidentsday': g['aliases'].extend(['Presidents Day','Washington’s Birthday','Washington\'s Birthday'])
            if (year,n)==('2008',100):
                for g in groups:
                    if norm(g['display'])=='martinlutherkingjrday': g['aliases'].extend(['MLK Day','Martin Luther King Day'])
            if (year,n)==('2025',126):
                for g in groups:
                    name=norm(g['display'])
                    if name=='martinlutherkingjrday': g['aliases'].extend(['MLK Day','Martin Luther King Day'])
                    if name=='thanksgivingday': g['aliases'].append('Thanksgiving')
                    if name=='christmasday': g['aliases'].append('Christmas')
            if (year,n)==('2025',118):
                for g in groups:
                    if norm(g['display']).startswith('integratedcircuit'): g['aliases'].append('IC')
            if (year,n)==('2025',98):
                for g in groups:
                    if '15th Amendment' in g['display']:
                        g['aliases']=list(dict.fromkeys([*g['aliases'],'Fifteenth Amendment','15th']))
            if (year,n)==('2025',102):
                for g in groups:
                    if '19th Amendment' in g['display']:
                        g['aliases']=list(dict.fromkeys([*g['aliases'],'Nineteenth Amendment','19th']))
            if (year,n)==('2008',61):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'high taxes','taxation without representation']))
                groups[1]['aliases']=list(dict.fromkeys([*groups[1]['aliases'],'quartering','boarding','British soldiers stayed in their houses']))
            if (year,n)==('2025',104):
                for g in groups:
                    if 'Great Crash' in g['display']: g['aliases'].append('1929')
            if (year,n)==('2025',40): groups[0]['aliases'].append('Vice President')
            if (year,n) in {('2025',42),('2025',43),('2025',44),('2025',45)}: groups[0]['aliases'].append('President')
            if (year,n) in {('2025',9),('2025',11)}: groups[0]['aliases'].append('the Declaration of Independence')
            if (year,n)==('2025',37): groups[0]['aliases'].extend(['Twenty-second Amendment','22nd Amendment'])
            if (year,n) in {('2025',50),('2025',52)}: groups[0]['aliases'].append('the Supreme Court')
            if (year,n)==('2025',77):
                for g in groups:
                    if 'Intolerable' in g['display']: g['aliases'].extend(['Coercive Acts','Intolerable Acts'])
            if (year,n)==('2025',80):
                for g in groups:
                    if 'Washington Crossing' in g['display']: g['aliases'].extend(['Washington Crossing the Delaware','Battle of Trenton'])
                    if 'Yorktown' in g['display']: g['aliases'].append('British surrender at Yorktown')
            if (year,n)==('2025',93):
                for g in groups:
                    if 'Antietam/Sharpsburg' in g['display']: g['aliases'].extend(['Antietam','Sharpsburg','Battle of Antietam','Battle of Sharpsburg'])
            if (year,n)==('2025',107):
                for g in groups:
                    if 'Korean War' in g['display']: g['aliases'].append('President during the Korean War')
                    if 'Federal-Aid Highway Act' in g['display']: g['aliases'].extend(['Created the Interstate System','Interstate System'])
            if (year,n)==('2025',87):
                for g in groups:
                    if 'Louisiana Purchase' in g['display']: g['aliases'].append('Louisiana Purchase')
            if (year,n)==('2025',66): groups[0]['aliases'].extend(['United States','flag'])
            if (year,n)==('2025',97):
                groups[0]['aliases']=list(dict.fromkeys([*groups[0]['aliases'],'Fourteenth Amendment','14th']))
            sets=curated_sets(year,n,req)
            rationale=rationale_for(q,answers,sets)
            source_ids=q['current_answer'].get('source_ids',[])
            source_urls=[SOURCE_INDEX[s] for s in source_ids if s in SOURCE_INDEX]
            source_urls.append(SOURCE_INDEX['uscis_2008_pdf' if year=='2008' else 'uscis_2025_pdf'])
            if geo:
                dependency=q.get('office_or_dependency')
                source_ids={'us_senator':['senate_phone','senate_class_ii','senate_class_iii','senate_appointments'], 'us_representative':['house_members','house_vacancies'], 'state_governor':['nga_governors']}.get(dependency,['state_capitals','island_capitals','guam_capital','pr_capital'])
                source_urls.extend(SOURCE_INDEX[s] for s in source_ids)
            source_urls=list(dict.fromkeys(source_urls))
            extra_sources={
                ('2008',56):['https://www.irs.gov/individual-tax-filing'],
                ('2008',62):['https://www.archives.gov/founding-docs/declaration-history'],
                ('2025',78):['https://www.archives.gov/founding-docs/declaration-history'],
                ('2025',93):['https://www.nps.gov/civilwar/search-battles-detail.htm?battleCode=LA002'],
                ('2025',118):['https://asia-archive.si.edu/learn/for-educators/teaching-china-with-the-smithsonian/explore-by-theme/production-and-technology/','https://airandspace.si.edu/stories/editorial/first-fireworks-origins-rocket'],
            }.get((year,n),[])
            source_urls=list(dict.fromkeys([*source_urls,*extra_sources]))
            answer_strategy='current_answer' if geo or dynamic_national else 'catalog'
            alias_strategy=('person_name' if (geo and q.get('office_or_dependency') in {'us_senator','us_representative','state_governor'} or dynamic_national and n not in ({46} if year=='2008' else set())) else 'political_party' if dynamic_national and year=='2008' and n==46 else 'official_variants_only') if answer_strategy=='current_answer' else 'catalog'
            entry={'question_number':n,'required_count':req,'answer_groups':groups,'reference_answers':[] if answer_strategy=='current_answer' else list(answers),'distractor_sets':sets,'rationale':rationale,'source_urls':source_urls,'strategy':{'answer_groups':answer_strategy,'current_aliases':alias_strategy,'distractors':'other_geographies' if geo else 'curated'},'review_status':'draft'}
            rows.append(entry)
            accepted='; '.join(answers) if answers else '[current answer resolved by selected geography]'
            dtext=' | '.join(' + '.join(s) for s in sets)
            reports.append(f"## {year} Q{n:03} — {q['question_text']}\n\n**Reference accepted:** {accepted}\n\n**Required concepts:** {req}\n\n**Wrong candidates:** {dtext}\n\n**Why wrong:** {rationale}\n\n**Strategy/status:** answers={entry['strategy']['answer_groups']}; aliases={entry['strategy']['current_aliases']}; distractors={entry['strategy']['distractors']}; reference snapshot={len(entry['reference_answers'])} values; draft. **Sources:** {', '.join(entry['source_urls'])}\n")
        catalogue['editions'][year]={'questions':rows}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'catalog.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+'\n')
    (OUT/'review-report.md').write_text('# Quick Question practice content review report\n\nDraft authoring report. Sources and official answer reference are preserved from the 2026-10-27 answer snapshots. All entries require root semantic review; none are approved.\n\n'+'\n'.join(reports))
    validate(catalogue)

def validate(c):
    assert c['content_version']==VERSION
    assert {y:len(c['editions'][y]['questions']) for y in ('2008','2025')}=={'2008':100,'2025':128}
    for y,b in c['editions'].items():
        assert [q['question_number'] for q in b['questions']]==list(range(1,len(b['questions'])+1))
        for q in b['questions']:
            assert q['review_status']=='draft' and q['required_count']>0
            assert isinstance(q['reference_answers'],list)
            assert len(q['distractor_sets'])>=3, (y,q['question_number'])
            assert all(len(s)==q['required_count'] for s in q['distractor_sets']), (y,q['question_number'])
            assert q['strategy']['answer_groups']=='current_answer' or q['answer_groups'], (y,q['question_number'])
            if q['strategy']['answer_groups']=='current_answer': assert not q['answer_groups']
            if q['strategy']['answer_groups']=='current_answer': assert q['reference_answers']==[]
            else: assert q['reference_answers']
            assert q['strategy']['current_aliases'] in ({'person_name','political_party','official_variants_only'} if q['strategy']['answer_groups']=='current_answer' else {'catalog'})
            alias_owner={}
            for group in q['answer_groups']:
                for value in [group['display'],*group['aliases']]:
                    key=norm(value)
                    if key in alias_owner and alias_owner[key]!=group['key']:
                        raise ValueError(f'Ambiguous alias {value!r} in {y} Q{q["question_number"]}')
                    alias_owner[key]=group['key']
            normalized_sets=set()
            for option in q['distractor_sets']:
                key=tuple(sorted(norm(x) for x in option))
                assert key not in normalized_sets, (y,q['question_number'],'duplicate distractor set')
                normalized_sets.add(key)
                matched=[alias_owner.get(norm(x)) for x in option]
                if q['strategy']['answer_groups']=='catalog':
                    complete=len(matched)==q['required_count'] and all(matched) and len(set(matched))==q['required_count']
                    if complete: raise ValueError(f'Distractor is a complete correct response in {y} Q{q["question_number"]}: {option}')
                    if q['required_count']==1 and any(matched): raise ValueError(f'Distractor collides with a correct alias in {y} Q{q["question_number"]}: {option}')
            alias_owner={}
            for group in q['answer_groups']:
                for value in [group['display'],*group['aliases']]:
                    key=norm(value)
                    if key in alias_owner and alias_owner[key]!=group['key']:
                        raise ValueError(f'Ambiguous alias {value!r} in {y} Q{q["question_number"]}')
                    alias_owner[key]=group['key']
            normalized_sets=set()
            for option in q['distractor_sets']:
                key=tuple(sorted(norm(x) for x in option))
                assert key not in normalized_sets, (y,q['question_number'],'duplicate distractor set')
                normalized_sets.add(key)
                matched=[alias_owner.get(norm(x)) for x in option]
                if q['strategy']['answer_groups']=='catalog':
                    complete=len(matched)==q['required_count'] and all(matched) and len(set(matched))==q['required_count']
                    if complete: raise ValueError(f'Distractor is a complete correct response in {y} Q{q["question_number"]}: {option}')
                    if q['required_count']==1 and any(matched): raise ValueError(f'Distractor collides with a correct alias in {y} Q{q["question_number"]}: {option}')
    print('Validated 228 draft entries: 100 (2008), 128 (2025); >=3 complete sets per question.')

if __name__=='__main__': build()
