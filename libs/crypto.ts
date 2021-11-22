//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.


import {AES, MD5, mode, enc} from "crypto-js";
import { Base64 } from 'js-base64';
import { isNonEmptyString } from "douhub-helper-util";

//Encrypt a string with key and iv
export const encrypt = (s:string, key:string, iv:string) :string => {

    if (!isNonEmptyString(key)) throw 'Encrypt key is not provided.';
    if (!isNonEmptyString(iv)) throw 'Encrypt iv is not provided.';
    try {
        const result = (AES.encrypt(s, MD5(key), { iv: MD5(iv), mode: mode.CBC })).ciphertext.toString(enc.Base64);
        return Base64.encode(result);
    }
    catch (error) {
        console.error(error);
        return '';
    }
};

//Decrypt a string with key and iv
export const decrypt = (s:string, key:string, iv:string):string => {

    if (!isNonEmptyString(key)) throw 'Decrypt key is not provided.';
    if (!isNonEmptyString(iv)) throw 'Decrypt iv is not provided.';

    try {
        s = enc.Base64.parse(s).toString(enc.Utf8);
        const result = AES.decrypt(s, MD5(key), { iv: MD5(iv), mode: mode.CBC });
        return result.toString(enc.Utf8);
    }
    catch (error) {
        console.error(error);
        return '';
    }
};

